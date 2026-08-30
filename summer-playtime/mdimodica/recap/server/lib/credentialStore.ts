import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {PACKAGE_ROOT} from './paths.js';

/**
 * Optional on-disk store for credentials entered through the Settings drawer.
 *
 * WHY NOT localStorage
 * --------------------
 * The browser only ever needed to persist tokens in order to survive a *server*
 * restart — a page reload was already covered, because the server process is
 * what holds them. Solving a server problem by writing secrets into the browser
 * profile put them at rest somewhere every extension with host access can read,
 * and somewhere Recap cannot set permissions on. The server can do the same job
 * with a 0600 file it owns.
 *
 * WHY NOT .env
 * ------------
 * `.env` is authored by hand and carries comments and ordering. Rewriting it
 * from a UI would quietly destroy both. This file is machine-owned, so there is
 * nothing of the user's to lose.
 */

/** Owner read/write only. The whole point of preferring this over localStorage. */
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

const FILE_NAME = 'credentials.json';

function defaultDirectory(): string {
	if (process.platform === 'win32' && process.env.APPDATA) {
		return path.join(process.env.APPDATA, 'recap');
	}
	const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
	return path.join(base, 'recap');
}

export const DEFAULT_DIRECTORY = defaultDirectory();
export const DEFAULT_CREDENTIAL_FILE = path.join(DEFAULT_DIRECTORY, FILE_NAME);

/**
 * Where the *location* of the credential file is recorded.
 *
 * Chicken-and-egg: the store cannot tell us where the store is. So this pointer
 * always lives at the platform default, and only ever holds a path — never a
 * secret. That is also why it stays behind when the user moves the credentials
 * elsewhere.
 */
const LOCATION_FILE = path.join(DEFAULT_DIRECTORY, 'location.json');

/* ------------------------------------------------------------- resolution */

function readPointer(): string {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(LOCATION_FILE, 'utf8'));
		const value = (parsed as { path?: unknown })?.path;
		return typeof value === 'string' && value.trim() ? value.trim() : '';
	} catch {
		return '';
	}
}

/** env override → pointer file → platform default. */
export function credentialFilePath(): string {
	const fromEnv = process.env.RECAP_CREDENTIALS_PATH?.trim();
	if (fromEnv) {
		const resolved = validateCredentialPath(fromEnv);
		if (resolved.ok) return resolved.path;
	}
	const pointer = readPointer();
	return pointer || DEFAULT_CREDENTIAL_FILE;
}

/* ------------------------------------------------------------- validation */

export type PathValidation = { ok: true; path: string } | { ok: false; error: string };

/**
 * Turn user input into a usable absolute file path, or explain why it is not.
 *
 * Accepts a directory (the filename is appended) or a full file path, and
 * expands a leading `~`.
 */
export function validateCredentialPath(input: string): PathValidation {
	const raw = input.trim();
	if (!raw) return {ok: true, path: DEFAULT_CREDENTIAL_FILE};

	const expanded =
		raw === '~' || raw.startsWith(`~${path.sep}`) || raw.startsWith('~/')
			? path.join(os.homedir(), raw.slice(1))
			: raw;

	if (!path.isAbsolute(expanded)) {
		return {ok: false, error: 'Use an absolute path, for example ~/.config/recap'};
	}

	const normalised = path.normalize(expanded);

	/**
	 * `fs.realpathSync` for a path that does not exist yet.
	 *
	 * The repo check has to see through symlinks, but the file being validated
	 * is usually about to be created. Resolve the deepest ancestor that does
	 * exist and re-attach the rest; if nothing resolves, fall back to the input
	 * so the caller still gets a lexical comparison rather than a throw.
	 */
	function realPathOf(candidate: string): string {
		let head = candidate;
		const tail: string[] = [];
		for (; ;) {
			try {
				return path.join(fs.realpathSync(head), ...tail);
			} catch {
				const parent = path.dirname(head);
				if (parent === head) return candidate;
				tail.unshift(path.basename(head));
				head = parent;
			}
		}
	}

	// A directory, or something clearly meant as one, gets the filename appended.
	const looksLikeDirectory =
		raw.endsWith('/') ||
		raw.endsWith(path.sep) ||
		(fs.existsSync(normalised) && fs.statSync(normalised).isDirectory()) ||
		path.extname(normalised) === '';

	const target = looksLikeDirectory ? path.join(normalised, FILE_NAME) : normalised;

	// Refuse anywhere inside the working tree. A secrets file under version
	// control is exactly the failure this whole design exists to prevent, and
	// `.gitignore` cannot be relied on for a path the user just invented.
	// Compare real paths, not strings. A lexical compare lets a symlink such as
	// `~/recap -> <repo>/recap` through: path.relative() answers `../..`, the
	// check passes, and the tokens land in the working tree anyway.
	const relativeToRepo = path.relative(realPathOf(PACKAGE_ROOT), realPathOf(target));
	// An empty relative path means `target` IS the repo root — also inside it.
	if (!relativeToRepo.startsWith('..') && !path.isAbsolute(relativeToRepo)) {
		return {
			ok: false,
			error: 'Choose a location outside the Recap project directory, so credentials can never be committed.',
		};
	}

	// Writability is checked against the nearest EXISTING ancestor, without
	// creating anything.
	//
	// This function runs on every keystroke in the Settings drawer to preview the
	// resolved path. An earlier version called `mkdirSync(..., recursive)` to
	// test the location, which meant typing "~/my-secrets" scattered half-typed
	// directories across the home folder — and hung outright on virtual paths
	// like /proc. Directories are created only when credentials are actually
	// written.
	const parent = path.dirname(target);
	const ancestor = nearestExistingAncestor(parent);

	if (!ancestor) {
		return {ok: false, error: `No part of ${toDisplayPath(parent)} exists.`};
	}

	try {
		if (!fs.statSync(ancestor).isDirectory()) {
			return {ok: false, error: `${toDisplayPath(ancestor)} is a file, not a folder.`};
		}
		fs.accessSync(ancestor, fs.constants.W_OK);
	} catch {
		return {
			ok: false,
			error: `Cannot write to ${toDisplayPath(ancestor)}. Check the path and its permissions.`,
		};
	}

	// Writing a file over an existing directory fails at save time; say so now.
	if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
		return {ok: false, error: `${toDisplayPath(target)} is a folder.`};
	}

	return {ok: true, path: target};
}

/**
 * Collapse the home directory to `~` for anything shown in the UI.
 *
 * An absolute path embeds the account name, which then travels into every
 * screenshot and shared screen of the Settings drawer. `~/.config/recap/…` is
 * both anonymous and easier to read.
 */
export function toDisplayPath(target: string): string {
	const home = os.homedir();
	if (!home || !target.startsWith(home)) return target;
	const rest = target.slice(home.length);
	if (rest && rest !== path.sep && !rest.startsWith(path.sep)) return target;
	return `~${rest}`;
}

/** Walk up until something exists. Stops at the filesystem root. */
function nearestExistingAncestor(from: string): string | null {
	let current = from;
	for (; ;) {
		if (fs.existsSync(current)) return current;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

/* ------------------------------------------------------------------ store */

/**
 * Never throws. A missing, unreadable or corrupt store must degrade to "no
 * saved credentials" — refusing to start because a cache file is malformed
 * would be a worse failure than asking for the tokens again.
 */
export function readStoredCredentials(): Record<string, string> {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(credentialFilePath(), 'utf8'));
		if (typeof parsed !== 'object' || parsed === null) return {};

		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value === 'string' && value.trim()) out[key] = value;
		}
		return out;
	} catch {
		return {};
	}
}

/** Returns false when the write failed, so the UI can say so rather than lie. */
export function writeStoredCredentials(values: Record<string, string>): boolean {
	const target = credentialFilePath();
	try {
		fs.mkdirSync(path.dirname(target), {recursive: true, mode: DIR_MODE});
		fs.writeFileSync(target, JSON.stringify(values, null, 2), {mode: FILE_MODE});
		// mkdir/writeFile only apply `mode` when creating; an existing file keeps
		// whatever permissions it had, so tighten it explicitly.
		fs.chmodSync(target, FILE_MODE);
		return true;
	} catch {
		return false;
	}
}

export function clearStoredCredentials(): void {
	try {
		fs.rmSync(credentialFilePath(), {force: true});
	} catch {
		/* already gone, or not ours to delete */
	}
}

export function hasStoredCredentials(): boolean {
	return fs.existsSync(credentialFilePath());
}

/**
 * Point the store at a new location, moving anything already saved.
 *
 * The old file is deleted after the new one is written, never before: a failed
 * move must not be able to lose the only copy of the user's tokens.
 */
export function moveCredentialStore(target: string): boolean {
	const current = credentialFilePath();
	if (path.resolve(current) === path.resolve(target)) return writePointer(target);

	const existing = fs.existsSync(current) ? readStoredCredentials() : null;

	if (existing && Object.keys(existing).length) {
		try {
			fs.mkdirSync(path.dirname(target), {recursive: true, mode: DIR_MODE});
			fs.writeFileSync(target, JSON.stringify(existing, null, 2), {mode: FILE_MODE});
			fs.chmodSync(target, FILE_MODE);
		} catch {
			return false;
		}
	}

	if (!writePointer(target)) return false;

	// Only now is it safe to drop the old copy.
	try {
		if (existing) fs.rmSync(current, {force: true});
	} catch {
		/* the new copy is in place; a stale old one is not worth failing over */
	}
	return true;
}

function writePointer(target: string): boolean {
	try {
		fs.mkdirSync(DEFAULT_DIRECTORY, {recursive: true, mode: DIR_MODE});
		if (path.resolve(target) === path.resolve(DEFAULT_CREDENTIAL_FILE)) {
			// Back to the default: drop the pointer rather than record a redundant one.
			fs.rmSync(LOCATION_FILE, {force: true});
			return true;
		}
		fs.writeFileSync(LOCATION_FILE, JSON.stringify({path: target}, null, 2), {
			mode: FILE_MODE,
		});
		return true;
	} catch {
		return false;
	}
}
