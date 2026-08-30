#!/usr/bin/env node
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * `recap` — launch the dashboard from anywhere.
 *
 * Installed with `npm link` (or `npm i -g .`), this runs from whatever
 * directory the shell happens to be in. Nothing below may depend on
 * process.cwd(): every path is resolved against the package, and the server
 * loads `.env` from the package root for the same reason.
 */

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
  recap — what did I do last week?

  Usage
    recap                 start with your real sources and open the browser
    recap --demo          start with generated sample data (no credentials, no network)

  Options
    --port <n>            listen on a specific port          (default 4319)
    --no-open             do not open a browser
    --help, -h            this message

  Configuration lives in ${path.join(PACKAGE_ROOT, '.env')}
  (or in the app's Settings drawer, for the current session only).
`);
    process.exit(0);
}

const demo = argv.includes('--demo');
const noOpen = argv.includes('--no-open');
const port = readPort(argv) ?? 4319;

/* ------------------------------------------------------------------ build */

// Both halves are compiled: the SPA into web/dist, the server into dist/.
// A globally linked install that was never built would otherwise fail with a
// module-not-found stack instead of an explanation.
const SERVER_ENTRY = path.join(PACKAGE_ROOT, 'dist', 'server', 'index.js');
const SPA_ENTRY = path.join(PACKAGE_ROOT, 'web', 'dist', 'index.html');

if (!fs.existsSync(SERVER_ENTRY) || !fs.existsSync(SPA_ENTRY)) {
    console.log('  Building (first run only)…');
    if (runBuild() !== 0) {
        console.error('\n  Build failed. Run `npm install && npm run build` in', PACKAGE_ROOT, '\n');
        process.exit(1);
    }
}

/* ----------------------------------------------------------------- server */

const serverArgs = [SERVER_ENTRY, '--port', String(port)];
if (demo) serverArgs.push('--demo');

const server = spawn(process.execPath, serverArgs, {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
});

server.on('exit', (code) => process.exit(code ?? 0));

// Ctrl-C should stop the server, not orphan it. Written out rather than looped
// so each signal is forwarded as itself: a loop over a string array widens the
// signal name to `string`, which is how this went unchecked.
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));

if (!noOpen) waitThenOpen(`http://localhost:${port}`);

/* ---------------------------------------------------------------- helpers */

/**
 * @param {string[]} args
 * @returns {number | null} null when unset or unparseable, so the caller's
 *   default applies rather than a NaN port.
 */
function readPort(args) {
    const i = args.indexOf('--port');
    if (i !== -1 && args[i + 1]) return Number(args[i + 1]) || null;
    const inline = args.find((a) => a.startsWith('--port='));
    return inline ? Number(inline.slice(7)) || null : null;
}

function runBuild() {
    const {status} = spawnSync('npm', ['run', 'build'], {
        cwd: PACKAGE_ROOT,
        stdio: 'inherit',
        // npm is a .cmd shim on Windows and is not directly executable.
        shell: process.platform === 'win32',
    });
    return status;
}

/**
 * Poll until the server actually answers before opening the browser. Opening
 * immediately races the listen() call and lands on a connection-refused page
 * often enough to look broken.
 *
 * @param {string} url
 */
async function waitThenOpen(url) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${url}/api/config`);
            if (res.ok) return openBrowser(url);
        } catch {
            /* not listening yet */
        }
        await new Promise((r) => setTimeout(r, 150));
    }
    console.log(`\n  Server did not answer in time. Open ${url} manually.\n`);
}

/** @param {string} url */
function openBrowser(url) {
    const cmd =
        process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try {
        spawn(cmd, args, {stdio: 'ignore', detached: true}).unref();
    } catch {
        console.log(`\n  Could not open a browser. Go to ${url}\n`);
    }
}
