import {execFile} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';

import type {ActivityEventDto} from '../../shared/contracts.js';
import type {GitConfig} from '../config.js';
import {makeEvent} from '../lib/events.js';
import {SourceError} from '../lib/http.js';
import type {AdapterResult, DateWindow} from './types.js';

const exec = promisify(execFile);

/**
 * Local git adapter.
 *
 * Shells out to `git log` in each configured repository. Read-only: no
 * checkout, no fetch, no writes. We use a unit-separator delimiter rather than
 * a printable one because commit subjects routinely contain `|`, `;` and tabs.
 */

const SEP = '\x1f'; // unit separator
const REC = '\x1e'; // record separator

const MAX_BUFFER = 20 * 1024 * 1024;

export async function fetchGit(
	{repos, author}: GitConfig,
	{from, to}: DateWindow,
): Promise<AdapterResult> {
	if (!repos.length) {
		throw new SourceError('No local repositories configured', {code: 'not-configured'});
	}

	const perRepo = await Promise.allSettled(
		repos.map(async (repo) => {
			// Recap answers "what did *I* do". Without an author filter a shared
			// repo returns the whole team's commits, which is actively misleading.
			// Fall back to the repo's own configured identity.
			const who = author || (await detectAuthor(repo));
			return logRepo(repo, who, from, to);
		}),
	);

	const events: ActivityEventDto[] = [];
	const failures: string[] = [];

	perRepo.forEach((result, index) => {
		const repo = repos[index] ?? '(unknown)';
		if (result.status === 'fulfilled') events.push(...result.value);
		else failures.push(`${path.basename(repo)}: ${errorMessage(result.reason)}`);
	});

	// One bad path shouldn't hide the commits from the other three repos.
	if (!events.length && failures.length) {
		throw new SourceError(failures.join('; '), {code: 'error'});
	}

	return {events, warnings: failures};
}

async function logRepo(
	repoPath: string,
	author: string,
	from: string,
	to: string,
): Promise<ActivityEventDto[]> {
	const args = [
		'-C',
		repoPath,
		'log',
		'--all',
		// Merge commits carry no authored change (+0/−0) and read as noise in a
		// standup feed ("Merge branch 'develop' into 'sandbox'"). Skip them.
		'--no-merges',
		`--since=${new Date(from).toISOString()}`,
		`--until=${new Date(to).toISOString()}`,
		`--pretty=format:${REC}%H${SEP}%an${SEP}%ae${SEP}%aI${SEP}%s`,
		'--numstat',
	];
	if (author) args.push(`--author=${author}`);

	let stdout: string;
	try {
		({stdout} = await exec('git', args, {maxBuffer: MAX_BUFFER}));
	} catch (error) {
		const message = execErrorMessage(error);
		if (/not a git repository/i.test(message)) throw new Error('not a git repository');
		if (/ENOENT/.test(message)) throw new Error('path does not exist');
		throw new Error((message.split('\n')[0] ?? message).slice(0, 140));
	}

	const repoName = path.basename(repoPath.replace(/\/+$/, ''));
	const branch = await currentBranch(repoPath);

	return stdout
		.split(REC)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => parseCommit(chunk, repoName, branch))
		.filter((event): event is ActivityEventDto => event !== null);
}

function parseCommit(
	chunk: string,
	repoName: string,
	branch: string,
): ActivityEventDto | null {
	const [header = '', ...statLines] = chunk.split('\n');
	const [sha, authorName, authorEmail, iso, ...subjectParts] = header.split(SEP);
	if (!sha || !iso) return null;

	const subject = subjectParts.join(SEP);

	let insertions = 0;
	let deletions = 0;
	let files = 0;

	for (const line of statLines) {
		const match = /^(\d+|-)\t(\d+|-)\t/.exec(line);
		if (!match) continue;
		files += 1;
		// "-" means binary file; count the file but not the lines.
		if (match[1] !== '-') insertions += Number(match[1]);
		if (match[2] !== '-') deletions += Number(match[2]);
	}

	return makeEvent({
		id: `git:${repoName}:${sha}`,
		source: 'git',
		kind: 'commit',
		action: 'committed',
		title: subject,
		url: null,
		timestamp: iso,
		project: repoName,
		meta: {
			sha: sha.slice(0, 7),
			branch,
			author: authorName,
			authorEmail,
			insertions,
			deletions,
			files,
		},
	});
}

async function currentBranch(repoPath: string): Promise<string> {
	try {
		const {stdout} = await exec('git', ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
		return stdout.trim();
	} catch {
		return '';
	}
}

/** Resolve the default author filter from a repo's own git config. */
export async function detectAuthor(repoPath: string): Promise<string> {
	try {
		const {stdout} = await exec('git', ['-C', repoPath, 'config', 'user.email']);
		return stdout.trim();
	} catch {
		return '';
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** `execFile` rejections carry the useful text on `stderr`, not `message`. */
function execErrorMessage(error: unknown): string {
	const stderr = (error as { stderr?: string }).stderr;
	return String(stderr || errorMessage(error));
}
