import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Absolute path to the package root (the directory holding package.json).
 *
 * Found by walking up rather than by counting `..` segments, because the same
 * code runs from two different depths: `server/config.ts` under tsx during
 * development, and `dist/server/config.js` after compilation. A hardcoded
 * relative hop would be correct in exactly one of them.
 *
 * This must never be derived from `process.cwd()`: the global `recap` command
 * runs from arbitrary directories, and resolving `.env` against the shell's
 * location would silently find nothing and report every source as
 * unconfigured.
 */
function findPackageRoot(startDir: string): string {
	let dir = startDir;
	for (; ;) {
		if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error(`Could not locate package.json above ${startDir}`);
		}
		dir = parent;
	}
}

export const PACKAGE_ROOT = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));

export const WEB_DIST = path.join(PACKAGE_ROOT, 'web', 'dist');
export const ENV_FILE = path.join(PACKAGE_ROOT, '.env');
