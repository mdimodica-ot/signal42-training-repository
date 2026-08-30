# CLAUDE.md — working rules for this project

Context for AI agents working in `recap/`. Read `SPEC.md` for what the app is and why; this file is about how to change
it safely.

---

## 🔴 Rule zero: never commit secrets

**Non-negotiable.**

- `.env` is gitignored. Never remove that entry, never `git add -f` it.
- Never paste a real token into source, a comment, `SPEC.md`, a test fixture, a commit message, or a log line.
  `.env.example` holds placeholders only.
- Never echo token *values* back to the browser. `GET /api/config` returns
  `hasToken: true|false` and a `tokenOrigin`. Keep it that way.
- Tokens must not travel in URL query strings — they land in access logs and shell history. Use headers or a POST body.
- **No credentials in `localStorage`.** The browser stores UI preferences only. Persistence is the *server's* job — see
  the three layers below. Do not
  "helpfully" re-add browser storage: it puts secrets at rest somewhere we cannot set permissions on, to solve a problem
  the credential file already solves.
- The credential file is written `0600`, **outside the repo**. Its location is user-configurable, and
  `validateCredentialPath()` REFUSES any path inside
  `PACKAGE_ROOT`. Never weaken that check, and never drop the `chmod`.
- **`validateCredentialPath()` must stay side-effect free.** It runs on every keystroke to preview the resolved path. It
  used to `mkdirSync(recursive)` to test writability, which scattered half-typed directories across the home folder and
  hung outright on `/proc`. Check the nearest *existing* ancestor; create directories only when actually writing.
- **Recap never writes `.env`.** It is hand-authored, with comments and ordering that a machine rewrite would destroy.
  Clearing credentials must therefore say plainly that `.env` is untouched.
- **`.env` is optional and stays supported.** The Settings drawer is the documented path; `.env` remains for
  config-as-code, and is the only home for
  `PORT`, `GITLAB_ENRICH` and `RECAP_CREDENTIALS_PATH`. Do not "tidy it away".
- **Never send an absolute filesystem path to the browser.** It embeds the account name, which then leaks into
  screenshots and devtools captures. The API exposes `storePathDisplay` / `storePathDefaultDisplay` only, collapsed via
  `toDisplayPath()`. Collapsing replaces a prefix, so display equality still implies path equality — comparisons stay
  correct.
- Before committing: `git diff --staged | grep -iE 'glpat-|ATATT|ATCTT|Bearer '`
  should print nothing.

## Rule one: nothing that identifies a specific company

This repository is shared. No real tenant hostnames, account emails, project keys or internal URLs anywhere — including
comments, fixtures and docs. Use
`example.com`, `your-site.atlassian.net`, `gitlab.example.com`.

The design handoff (`design/`) is gitignored and kept outside the repo: it carries third-party design-system assets and
licensed fonts.

## Commands

```bash
npm install          # once — installs devDependencies, which the build needs

npm start            # production: build both halves, then serve live sources
npm run start:demo   # production build, served with generated fixtures

npm run build        # build:web (vite → web/dist) + build:server (tsc → dist/)
npm run serve        # serve an existing build (no rebuild), live
npm run serve:demo   # serve an existing build (no rebuild), demo
npm run typecheck    # web + server + bin; run this before claiming anything works

npm run dev             # Vite dev server on :5173, proxies /api → :4319
npm run dev:server      # tsx watch on the API it proxies to (second terminal)
npm run dev:server:demo # the same API, serving fixtures
```

**Both halves are TypeScript.** The server compiles with `tsc` to `dist/`, the SPA with Vite to `web/dist/`. Nothing
runs from `server/*.ts` directly except
`tsx` in development, so a stale `dist/` is a real failure mode — `npm start`
always rebuilds for that reason.

Three tsconfigs, so `npm run typecheck` leaves nothing uncovered:

| File                   | Covers                                | Why separate                    |
|------------------------|---------------------------------------|---------------------------------|
| `tsconfig.json`        | `web/src`, `shared`, `vite.config.ts` | DOM libs, bundler resolution    |
| `tsconfig.server.json` | `server`, `shared`                    | Node libs, NodeNext resolution  |
| `tsconfig.bin.json`    | `bin/*.js`                            | plain JS, checked via `checkJs` |

`bin/recap.js` stays JavaScript deliberately — it is the globally linked entry point and must run before any build
exists. It went uncovered long enough to accumulate a real type error, hence its own config. Keep all three wired into
the `typecheck` script; a config nobody runs is worse than none.

Installed globally with `npm link`, the `recap` command starts the app from any directory and opens a browser: `recap`,
`recap --demo`, `recap --port 4400`.

Port resolution: `--port` flag → `PORT` env → `4319`.

Claude Code launch configs live in `.claude/launch.json`: **`recap-demo`** and **`recap-live`**. Start them with
`preview_start`.

### Demo Mode is a launch mode, not a toggle

`npm run start:demo` starts a process that serves fixtures and makes no network calls. `npm start` serves real data and
does not render a demo control at all.
`?demo=1` on a live server is ignored — there is deliberately no way to talk a live process into showing invented
activity.

### Why CLI flags instead of env vars

`RECAP_DEMO=1 node …` is not valid syntax in cmd.exe, which would force a duplicate `demo:win` script.
`node dist/server/index.js --demo` works identically on every platform. `RECAP_DEMO=1` is still honoured.

## Architecture

Backend: Express + TypeScript, compiled to `dist/`. Frontend: Vue 3 + TypeScript + Pinia, built by Vite into `web/dist`,
which the Express process serves. One port, one process.

`shared/contracts.ts` holds the HTTP contract and is imported by **both** sides (`@shared/*` in the web build, a
relative path on the server). Change a response shape and the consumer fails to compile. Neither side may redeclare a
DTO locally — that is how the two drift apart silently.

That includes **inline** redeclarations, which are easy to miss because they do not look like a type definition:

```ts
getJson<{ demo: boolean; checks: DiagnosticCheck[] }>('/api/diagnose')  // ✗
getJson<DiagnoseResponse>('/api/diagnose')                              // ✓
```

The first compiles happily forever while the server's response drifts away from it. A contract type with no importers is
the symptom — if something in
`shared/contracts.ts` is unreferenced, look for the copy of it someone spelled out by hand rather than deleting the
original.

The frontend is layered, and the dependency arrow points inward only:

```
shared/contracts.ts  the wire format, imported by server AND web

web/src/
├── domain/          pure TS. No Vue, no fetch, no browser APIs.
│                    LocalDay, DateRange, ActivityEvent, ActivityFeed,
│                    SourceHealth, StandupReport, AppSettings.
├── application/     ports/ (interfaces) + usecases/. Depends on domain only.
├── infrastructure/  implements the ports: HTTP gateways, localStorage.
├── presentation/    Pinia stores + Vue components.
└── composition.ts   the ONLY file that names a concrete implementation.

server/
├── index.ts         routes, range resolution, per-source failure isolation
├── config.ts        .env + runtime overrides
├── adapters/        one per source, all returning AdapterResult
└── lib/             credentialStore, diagnose, events, http, paths
```

Rules that keep this honest:

- `domain/` must never import from `application/`, `infrastructure/`,
  `presentation/`, or `vue`. If a domain type needs a browser API, it is not a domain type.
- Stores and use cases depend on the interfaces in `application/ports/`, never on `fetch` or a concrete gateway. Swap
  implementations in `composition.ts`.
- Business rules go in `domain/`, not in a component. If two components need the same calculation, it belongs in the
  aggregate — that is why filtering and day-grouping live in `ActivityFeed` and not in the timeline component.

## Testing

There is no test runner yet. Verify changes by exercising the app:

```bash
npm run typecheck                                   # all three projects, must be clean

# Port 4319 is the default; the .claude/launch.json configs use 4320.
PORT=4319
curl -s "localhost:$PORT/api/activity?preset=7d" | head -c 400
for p in yesterday 7d week month; do curl -s "localhost:$PORT/api/activity?preset=$p" >/dev/null; done

# a live server must ignore ?demo=1
curl -s "localhost:$PORT/api/activity?preset=7d&demo=1" | grep -o '"demo":[a-z]*'

# credential diagnostics, without touching the timeline
curl -s "localhost:$PORT/api/diagnose"
```

If you add a test runner, prefer `node --test` — it needs no new dependency. The `domain/` layer is pure and can be
tested without a browser or a server.

## Conventions

- **ES modules** (`"type": "module"`), Node 18+. Use built-in `fetch`; do not add axios/node-fetch.
- **TypeScript is strict**, including `noUncheckedIndexedAccess`. Do not reach for `any` to silence it.
- **Design tokens** are the `--rc-*` custom properties in
  `web/src/styles/main.css`. Use the variables; never hardcode a hex that duplicates a token.
- **Comments explain *why*.** Several comments document non-obvious API and browser behaviour (see below). Do not delete
  them as noise — they encode findings that cost real debugging.

## Landmines — do not "simplify" these

Each guards a verified, counter-intuitive behaviour. Removing one reintroduces a real bug.

0. **`dist/` and `web/dist/` are build output — never read them as source.**
   Both tsconfigs list them under `exclude` for one reason: editors index by directory, not by `include`, and will
   analyse compiled output as if a human wrote it. The minified SPA bundle then reports every property access as an
   "unresolved variable", producing dozens of warnings that name real symbols in real-looking files and are all false.
   Before chasing an IDE warning, check which file it is actually in. `npm run typecheck` is the source of truth; it is
   clean or it is not.

1. **Native scrollbars are hidden globally** (`main.css`) and replaced by
   `OverlayScrollbar.vue`. A styled `::-webkit-scrollbar` still reserves a gutter and narrows the layout;
   `overflow: overlay` is deprecated. Do not
   "restore" native scrollbars without removing the overlay component.

2. **`server/adapters/jira.ts` — the `/myself` preflight.**
   `/rest/api/3/search/jql` answers `200 {"issues":[]}` when credentials are wrong. Without the preflight, a bad token
   renders as "no activity". Same reasoning for the `/user/current` call in `confluence.ts`.

3. **`/rest/api/3/search/jql`, not `/rest/api/3/search`.** The old endpoint is retired and 410s. The new one paginates
   by `nextPageToken`, not `startAt`.

4. **`LocalDay`** (`web/src/domain/time/LocalDay.ts`) and `parseDay()` in
   `server/index.ts`. Both deliberately avoid `new Date(str)` and
   `toISOString()` for calendar days: those round-trip through UTC and shift the day backwards east of Greenwich. "10
   Aug" became "9 Aug" three separate times before the day became a type.

5. **`precision: 'day'`** in `lib/events.ts` and `ActivityEvent.displayTime`. Do not default a missing time to midnight;
   such events sort to end-of-day and render `—`.

6. **Confluence `created` vs `edited`.** `contributor = currentUser()` matches pages you only edited. Keep the two
   counted separately.

7. **`git log --no-merges` and the author filter.** Without the author filter a shared repository returns the whole
   team's commits.

8. **Per-source failure isolation** in `GET /api/activity`. Never let one adapter's rejection fail the whole request;
   the UI depends on per-source status to render its partial state.

9. **`server/config.ts` loads `.env` from the package root**, not
   `process.cwd()`. The global `recap` command runs from arbitrary directories;
   `import 'dotenv/config'` would silently find nothing and report every source as unconfigured.

10. **Blank token inputs mean "leave alone", not "delete"** — see
    `CredentialsDraft`. Token fields start empty because the server never sends values back; submitting them as empty
    strings would wipe `.env` values every time anyone opened Settings and pressed Save.

## Adding a data source

1. Write `server/adapters/<name>.ts` exporting
   `async fetch<Name>(config, { from, to }) → { events, warnings }`.
2. Normalise through `makeEvent()` — never hand-roll the event object.
3. Throw `SourceError` with a `status` and `code` so the UI can classify it.
4. Register it in the `jobs` array in `server/index.ts` and in `readiness()`.
5. Add fixtures to `mock/mock-data.ts`, and add it to `guaranteeCoverage()`.
6. Add the key to `SOURCE_KEYS`/`SOURCES` in
   `web/src/domain/activity/SourceKey.ts` and a colour in `main.css`.
7. Add a probe to `server/lib/diagnose.ts`.

## Git

- Work on a feature branch, never commit directly to `main`.
- **Do not commit or push unless explicitly asked.**
