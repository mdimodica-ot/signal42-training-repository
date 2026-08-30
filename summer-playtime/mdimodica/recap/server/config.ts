import dotenv from 'dotenv';

import type {AppSettingsDto, CredentialsPatch, SourceKey, TokenOrigin} from '../shared/contracts.js';
import {WRITABLE_KEYS} from '../shared/contracts.js';
import {ENV_FILE} from './lib/paths.js';
import {
	clearStoredCredentials,
	credentialFilePath,
	DEFAULT_CREDENTIAL_FILE,
	hasStoredCredentials,
	moveCredentialStore,
	type PathValidation,
	readStoredCredentials,
	toDisplayPath,
	validateCredentialPath,
	writeStoredCredentials,
} from './lib/credentialStore.js';

/**
 * Configuration comes from three places, in priority order:
 *
 *   1. Session values set through the Settings drawer without "remember".
 *      Memory only; they vanish when the process exits.
 *   2. The credential store — a 0600 file Recap owns, written only when the
 *      user asks it to remember. Survives a restart.
 *   3. The `.env` file next to package.json (gitignored), authored by hand.
 *
 * Tokens are never sent back to the browser. `publicConfig()` reports only
 * whether each source is configured, where the value came from, and the
 * non-secret bits (URLs, paths).
 */

dotenv.config({path: ENV_FILE, quiet: true});

/** Typed this session only. */
let session: Record<string, string> = {};

/** Mirror of the credential file, read once at boot and kept in step on write. */
let stored: Record<string, string> = readStoredCredentials();

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function raw(key: string): string {
	return str(session[key]) || str(stored[key]) || str(process.env[key]);
}

/** Where a value came from — the Clear-tokens dialog must be honest about
 *  which of the three layers it can actually remove. */
function originOf(key: string): TokenOrigin {
	if (str(session[key])) return 'session';
	if (str(stored[key])) return 'stored';
	if (str(process.env[key])) return 'env';
	return 'none';
}

/* ------------------------------------------------------------ CLI flags ---
 * Supported: --demo, --port <n> (or --port=<n>).
 *
 * These exist so npm scripts work identically on Windows: `RECAP_DEMO=1 node …`
 * is not valid in cmd.exe, whereas `node server/index.js --demo` is. CLI flags
 * take precedence over environment variables.
 */
const argv = process.argv.slice(2);

function cliFlag(name: string): boolean {
	return argv.includes(`--${name}`);
}

function cliOpt(name: string): string {
	const index = argv.indexOf(`--${name}`);
	const next = argv[index + 1];
	if (index !== -1 && next && !next.startsWith('--')) return next;
	const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
	return inline ? inline.slice(name.length + 3) : '';
}

/**
 * Demo Mode is a property of how the process was STARTED, not a runtime toggle.
 *
 * `npm start` serves real data and offers no way to reach the fixtures; the
 * demo switch is not rendered at all. `npm run start:demo` serves fixtures and
 * never touches the network. Keeping the two as separate processes means a
 * screenshot can never be ambiguous about which one you are looking at, and a
 * production run cannot be talked into showing invented activity by a stray
 * query parameter.
 */
export function demoEnabled(): boolean {
	if (cliFlag('demo')) return true;
	const value = str(process.env.RECAP_DEMO).toLowerCase();
	return value === '1' || value === 'true';
}

export interface GitConfig {
	repos: string[];
	author: string;
}

export interface GitLabConfig {
	baseUrl: string;
	token: string;
	enrich: boolean;
}

export interface AtlassianConfig {
	baseUrl: string;
	email: string;
	token: string;
}

export interface AppConfig {
	port: number;
	git: GitConfig;
	gitlab: GitLabConfig;
	jira: AtlassianConfig;
	confluence: AtlassianConfig;
}

/** True when the environment pins the location, so the UI must not offer to move it. */
export function storePathLocked(): boolean {
	return Boolean(process.env.RECAP_CREDENTIALS_PATH?.trim());
}

/** Resolve user input to an absolute file path without saving anything. */
export function resolveStorePath(input: string): PathValidation {
	return validateCredentialPath(input);
}

export type ApplyResult =
	| { ok: true }
	| { ok: false; error: string; field?: 'storePath' };

/**
 * Apply a patch from the Settings drawer.
 *
 * `remember` decides which layer it lands in. When remembering, the session
 * layer is cleared for those keys first — otherwise a value typed earlier in
 * the session would keep shadowing the one just saved to disk, and the drawer
 * would report a token as stored while a different one was actually in use.
 */
export function applySettings(
	patch: CredentialsPatch,
	remember: boolean,
	storePath?: string,
): ApplyResult {
	// Relocate before writing, so the values land in the location the user just
	// chose rather than the old one.
	if (storePath !== undefined && !storePathLocked()) {
		const resolved = validateCredentialPath(storePath);
		if (!resolved.ok) return {ok: false, error: resolved.error, field: 'storePath'};

		if (!moveCredentialStore(resolved.path)) {
			return {
				ok: false,
				error: `Could not move the credential file to ${resolved.path}.`,
				field: 'storePath',
			};
		}
		stored = readStoredCredentials();
	}

	const target = remember ? {...stored} : session;

	for (const key of WRITABLE_KEYS) {
		if (!(key in patch)) continue;
		const value = patch[key];
		if (!value) delete target[key];
		else target[key] = String(value);
		if (remember) delete session[key];
	}

	if (!remember) return {ok: true};

	stored = target;
	if (!writeStoredCredentials(stored)) {
		return {
			ok: false,
			error: 'Settings applied for this session, but could not be written to disk.',
		};
	}
	return {ok: true};
}

/** Forget everything Recap is holding: this session AND the credential file. */
export function clearAllCredentials(): void {
	session = {};
	stored = {};
	clearStoredCredentials();
}

export function getConfig(): AppConfig {
	return {
		port: Number(cliOpt('port')) || Number(raw('PORT')) || 4319,

		git: {
			repos: raw('RECAP_GIT_REPOS')
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean),
			author: raw('RECAP_GIT_AUTHOR'),
		},

		gitlab: {
			baseUrl: raw('GITLAB_BASE_URL').replace(/\/+$/, ''),
			token: raw('GITLAB_TOKEN'),
			// Per-MR diff stats and approvals need one extra HTTP call each.
			// Off by default so a 40-MR week doesn't fire 80 extra requests.
			enrich: raw('GITLAB_ENRICH') === '1',
		},

		jira: {
			baseUrl: raw('JIRA_BASE_URL').replace(/\/+$/, ''),
			email: raw('JIRA_EMAIL'),
			token: raw('JIRA_API_TOKEN'),
		},

		confluence: {
			baseUrl: raw('CONFLUENCE_BASE_URL').replace(/\/+$/, ''),
			email: raw('CONFLUENCE_EMAIL') || raw('JIRA_EMAIL'),
			token: raw('CONFLUENCE_API_TOKEN') || raw('JIRA_API_TOKEN'),
		},
	};
}

/** Which sources have enough config to even attempt a call. */
export function readiness(config: AppConfig = getConfig()): Record<SourceKey, boolean> {
	return {
		git: config.git.repos.length > 0,
		gitlab: Boolean(config.gitlab.baseUrl && config.gitlab.token),
		jira: Boolean(config.jira.baseUrl && config.jira.email && config.jira.token),
		confluence: Boolean(
			config.confluence.baseUrl && config.confluence.email && config.confluence.token,
		),
	};
}

/** True when at least one secret currently comes from `.env` rather than the UI. */
function hasEnvBackedSecret(): boolean {
	return (['GITLAB_TOKEN', 'JIRA_API_TOKEN', 'CONFLUENCE_API_TOKEN'] as const).some(
		(key) => originOf(key) === 'env',
	);
}

/** Safe to serialise to the browser. Contains no secrets. */
export function publicConfig(): AppSettingsDto {
	const config = getConfig();
	const ready = readiness(config);

	return {
		demo: demoEnabled(),
		connected: ready,
		connectedCount: Object.values(ready).filter(Boolean).length,
		clearable: Object.keys(session).length > 0 || Object.keys(stored).length > 0,
		envBacked: hasEnvBackedSecret(),
		remembered: hasStoredCredentials(),
		// Home-collapsed only: the absolute paths never leave the server.
		storePathDisplay: toDisplayPath(credentialFilePath()),
		storePathDefaultDisplay: toDisplayPath(DEFAULT_CREDENTIAL_FILE),
		storePathLocked: storePathLocked(),
		git: {repos: config.git.repos, author: config.git.author},
		gitlab: {
			baseUrl: config.gitlab.baseUrl,
			hasToken: Boolean(config.gitlab.token),
			tokenOrigin: originOf('GITLAB_TOKEN'),
			enrich: config.gitlab.enrich,
		},
		jira: {
			baseUrl: config.jira.baseUrl,
			email: config.jira.email,
			hasToken: Boolean(config.jira.token),
			tokenOrigin: originOf('JIRA_API_TOKEN'),
		},
		confluence: {
			baseUrl: config.confluence.baseUrl,
			email: config.confluence.email,
			hasToken: Boolean(config.confluence.token),
			tokenOrigin: originOf('CONFLUENCE_API_TOKEN'),
		},
	};
}

/** Basic-auth header for Atlassian Cloud (email + API token). */
export function basicAuth(email: string, token: string): string {
	return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}
