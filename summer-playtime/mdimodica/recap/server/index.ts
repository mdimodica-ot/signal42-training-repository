import express, {type Request, type Response} from 'express';
import fs from 'node:fs';
import path from 'node:path';

import type {ActivityResponse, CredentialsPatch, SourceKey, SourceStatusDto,} from '../shared/contracts.js';
import {SOURCE_KEYS, WRITABLE_KEYS} from '../shared/contracts.js';

import {
	applySettings,
	clearAllCredentials,
	demoEnabled,
	getConfig,
	publicConfig,
	readiness,
	resolveStorePath,
} from './config.js';
import {WEB_DIST} from './lib/paths.js';
import {toDisplayPath} from './lib/credentialStore.js';
import {fetchGit} from './adapters/git.js';
import {fetchGitLab} from './adapters/gitlab.js';
import {fetchJira} from './adapters/jira.js';
import {fetchConfluence} from './adapters/confluence.js';
import type {AdapterResult, DateWindow} from './adapters/types.js';
import {generateMockEvents} from './mock/mock-data.js';
import {filterByRange, sortEvents, summarise} from './lib/events.js';
import {diagnose} from './lib/diagnose.js';
import {SourceError} from './lib/http.js';

// This server only ever serves a production build; there is no dev middleware.
process.env.NODE_ENV ??= 'production';

const DEMO = demoEnabled();

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit: '64kb'}));

/* --------------------------------------------------------------- static ---
 * The frontend is a Vue SPA built by Vite into web/dist. `npm run dev` runs
 * Vite's own server and proxies /api back to this process, so nothing here
 * needs to know about development.
 */
const hasBuild = fs.existsSync(path.join(WEB_DIST, 'index.html'));
if (hasBuild) app.use(express.static(WEB_DIST, {index: false}));

/* ------------------------------------------------------------------ config */

app.get('/api/config', (_req: Request, res: Response) => res.json(publicConfig()));

app.post('/api/config', (req: Request, res: Response) => {
	// Tokens arrive here from the Settings drawer. Without `remember` they stay
	// in process memory for this session; with it they go to a 0600 file that
	// Recap owns. Either way they never reach the browser again.
	const body = (req.body ?? {}) as { values?: unknown; remember?: unknown; storePath?: unknown };
	const values = (body.values ?? {}) as Record<string, unknown>;
	const patch: CredentialsPatch = {};

	for (const key of WRITABLE_KEYS) {
		const value = values[key];
		if (typeof value === 'string') patch[key] = value;
	}

	const remember = body.remember === true;
	const storePath = typeof body.storePath === 'string' ? body.storePath : undefined;

	const result = applySettings(patch, remember, storePath);
	if (!result.ok) {
		// A bad path is the user's mistake to fix; a failed write is the machine's.
		const status = result.field === 'storePath' ? 400 : 500;
		return res.status(status).json({error: result.error, field: result.field});
	}

	res.json(publicConfig());
});

/**
 * Preview where a typed path would resolve to, without saving.
 *
 * The drawer shows the resolved location live as you type, and `~`, relative
 * paths and directories-versus-files all resolve server-side — the browser has
 * no idea what the home directory is or whether a path is writable.
 */
app.post('/api/config/resolve-path', (req: Request, res: Response) => {
	const input = typeof (req.body as { path?: unknown })?.path === 'string'
		? (req.body as { path: string }).path
		: '';
	const resolved = resolveStorePath(input);
	res.json(
		resolved.ok
			? {ok: true, display: toDisplayPath(resolved.path)}
			: {ok: false, display: '', error: resolved.error},
	);
});

app.delete('/api/config', (_req: Request, res: Response) => {
	clearAllCredentials();
	res.json(publicConfig());
});

/* --------------------------------------------------------------- diagnose */

/**
 * Why this exists: a 401 from Atlassian is not self-explanatory. The same
 * status covers an expired token, a scoped token used on a classic endpoint,
 * the wrong email, and an account password pasted where a token belongs.
 * Atlassian says which one it is in the response body, so we surface that
 * verbatim instead of collapsing it to "401 · token".
 */
app.get('/api/diagnose', async (_req: Request, res: Response) => {
	if (DEMO) return res.json({demo: true, checks: []});
	res.json({demo: false, checks: await diagnose(getConfig())});
});

/* ---------------------------------------------------------------- activity */

interface Job {
	key: SourceKey;
	ready: boolean;
	run: () => Promise<AdapterResult>;
}

app.get('/api/activity', async (req: Request, res: Response) => {
	const window = resolveRange(req.query as Record<string, string | undefined>);

	// An unparseable from/to used to reach toISOString() and throw RangeError.
	// Express 4 does not adopt rejections from an async handler, so that killed
	// the process instead of answering — one malformed query string taking down
	// every source, which is the opposite of the per-source isolation below.
	if (!window) {
		return res.status(400).json({error: 'Invalid date range. Use from and to as YYYY-MM-DD.'});
	}

	// Demo is decided by how the process was started. A query parameter cannot
	// talk a live server into serving fixtures.
	if (DEMO) return res.json(demoResponse(window));

	const config = getConfig();
	const ready = readiness(config);

	const jobs: Job[] = [
		{key: 'git', ready: ready.git, run: () => fetchGit(config.git, window)},
		{key: 'gitlab', ready: ready.gitlab, run: () => fetchGitLab(config.gitlab, window)},
		{key: 'jira', ready: ready.jira, run: () => fetchJira(config.jira, window)},
		{key: 'confluence', ready: ready.confluence, run: () => fetchConfluence(config.confluence, window)},
	];

	// One failing source must not take the others down: the UI has a dedicated
	// "partial results" state and needs per-source status to render it.
	const settled = await Promise.all(jobs.map(runJob));

	const events = sortEvents(
		filterByRange(
			settled.flatMap((entry) => entry.events),
			window.from,
			window.to,
		),
	);

	// Report the count that actually survived range filtering, per source.
	const kept = new Map<SourceKey, number>();
	for (const event of events) kept.set(event.source, (kept.get(event.source) ?? 0) + 1);

	const response: ActivityResponse = {
		demo: false,
		range: window,
		events,
		summary: summarise(events),
		sources: settled.map(({events: _unused, ...status}) => ({
			...status,
			count: status.ok ? (kept.get(status.key) ?? 0) : 0,
		})),
		fetchedAt: new Date().toISOString(),
	};

	res.json(response);
});

type SettledJob = SourceStatusDto & { events: ActivityResponse['events'] };

async function runJob(job: Job): Promise<SettledJob> {
	if (!job.ready) {
		return {
			key: job.key,
			ok: false,
			status: 0,
			code: 'not-configured',
			error: 'Not configured',
			count: 0,
			ms: 0,
			warnings: [],
			events: [],
		};
	}

	const startedAt = Date.now();
	try {
		const {events, warnings} = await job.run();
		return {
			key: job.key,
			ok: true,
			count: events.length,
			ms: Date.now() - startedAt,
			warnings,
			events,
		};
	} catch (error) {
		const sourceError = error instanceof SourceError ? error : null;
		return {
			key: job.key,
			ok: false,
			status: sourceError?.status ?? 0,
			code: sourceError?.code ?? 'error',
			error: error instanceof Error ? error.message : String(error),
			count: 0,
			ms: Date.now() - startedAt,
			warnings: [],
			events: [],
		};
	}
}

function demoResponse(window: DateWindow): ActivityResponse {
	const events = sortEvents(
		filterByRange(generateMockEvents(window), window.from, window.to),
	);

	return {
		demo: true,
		range: window,
		events,
		summary: summarise(events),
		sources: SOURCE_KEYS.map((key) => ({
			key,
			ok: true,
			count: events.filter((event) => event.source === key).length,
			ms: 0,
			warnings: [],
		})),
		fetchedAt: new Date().toISOString(),
	};
}

/* ------------------------------------------------------------------- range */

/**
 * Supported presets mirror the design's timeframe tabs. Everything is resolved
 * server-side so the client and server never disagree about "this week".
 */
function resolveRange(query: Record<string, string | undefined>): DateWindow | null {
	const now = new Date();

	if (query.from && query.to) {
		const from = parseDay(query.from);
		const to = parseDay(query.to);
		// Only user-supplied dates can be invalid; every preset below is built
		// from `now`. Reject here so the caller can answer 400 rather than
		// letting an Invalid Date reach toISOString().
		if (!from || !to) return null;
		return {from: startOfDay(from), to: endOfDay(to)};
	}

	switch (query.preset ?? '7d') {
		case 'yesterday': {
			const yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			return {from: startOfDay(yesterday), to: endOfDay(yesterday)};
		}
		case 'week': {
			// Monday-based working week, up to now.
			const start = new Date(now);
			start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
			return {from: startOfDay(start), to: endOfDay(now)};
		}
		case 'month': {
			return {from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now)};
		}
		case '7d':
		default: {
			const start = new Date(now);
			start.setDate(start.getDate() - 6);
			return {from: startOfDay(start), to: endOfDay(now)};
		}
	}
}

/**
 * Parse a user-supplied date as a LOCAL calendar day.
 *
 * `new Date("2026-08-01")` is defined to parse as UTC midnight, which east of
 * Greenwich is the *previous* day once converted to local time. Asking for
 * "Aug 1" would then silently include Jul 31. Split the parts instead.
 */
function parseDay(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	const parsed = new Date(value); // full timestamp: trust it as-is
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): string {
	const copy = new Date(date);
	copy.setHours(0, 0, 0, 0);
	return copy.toISOString();
}

function endOfDay(date: Date): string {
	const copy = new Date(date);
	copy.setHours(23, 59, 59, 999);
	return copy.toISOString();
}

/* ---------------------------------------------------------------- SPA tail */

// Anything that is not /api and not a built asset is a client-side route.
app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
	if (!hasBuild) {
		return res
			.status(503)
			.type('text/plain')
			.send('The frontend has not been built yet.\n\nRun:  npm run build\n');
	}
	res.sendFile(path.join(WEB_DIST, 'index.html'));
});

/* ------------------------------------------------------------------ listen */

const {port} = getConfig();
app.listen(port, () => {
	console.log(`\n  Recap running at http://localhost:${port}  [${DEMO ? 'demo' : 'live'}]\n`);
	if (!hasBuild) console.log('  ! No frontend build found — run `npm run build`.\n');
});
