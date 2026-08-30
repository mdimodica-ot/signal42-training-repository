# Recap

**All your work, in one place.** Recap pulls your activity out of local Git, GitLab, Jira and Confluence and lays it out
as a single timeline — ready for standup, retro or a status report.

Runs entirely on your laptop. No database, no hosting, no accounts.

## Try it in five seconds

```bash
cd recap
npm install
npm run start:demo
```

Open <http://localhost:4319>. Demo Mode uses generated fixtures, so it needs **no credentials and makes no network
calls**.

## Connect real sources

```bash
npm start
```

Then open **Settings** and paste your tokens in. That is the whole setup — there is no config file to create.

| Source         | What you need                                        |
|----------------|------------------------------------------------------|
| **Git**        | Absolute paths to local clones. Read-only `git log`. |
| **GitLab**     | Personal access token, `read_api` scope.             |
| **Jira**       | Account email + a **classic** API token (see below). |
| **Confluence** | Usually the same site and token as Jira.             |

Every integration is **read-only**. Recap never writes to any of them.

## Where credentials are kept

Tick **Remember on this machine** in Settings and the *server* writes them to a file with `0600` permissions — readable
only by your user account. Leave it unticked and they live in the server's memory until you stop it.

**Nothing is ever stored in the browser.**

| Layer           | Set from                          | Survives a restart |
|-----------------|-----------------------------------|--------------------|
| Session         | Settings, "Remember" **off**      | ✗                 |
| Credential file | Settings, "Remember" **on**       | ✓                 |
| `.env`          | your editor — optional, see below | ✓                 |

Higher rows win, so a value typed in Settings temporarily overrides `.env`
without changing the file.

### Choosing the location

Defaults to `~/.config/recap/credentials.json` (`%APPDATA%\recap\` on Windows)
and is editable in Settings. Type a folder or a full file path, `~` is expanded, and the resolved location updates as
you type. Changing it moves the existing file.

It refuses two things: a relative path, and anywhere **inside the Recap project directory** — a secrets file under
version control is the exact failure this design exists to prevent.

To pin it from the environment instead, set `RECAP_CREDENTIALS_PATH`; the field then shows as read-only.

**Clear stored tokens** deletes that file and forgets the session. It never touches `.env` — Recap does not edit files
you wrote.

## Optional: configure with a file instead

`.env` is **not required**. Use it when you would rather keep configuration as code — scripted setup, dotfiles, a new
laptop — or to set the few things the UI does not cover:

| Key                      | What it does                                           |
|--------------------------|--------------------------------------------------------|
| `PORT`                   | Port to listen on                                      |
| `GITLAB_ENRICH`          | Fetch per-MR diff stats and approvals (extra requests) |
| `RECAP_CREDENTIALS_PATH` | Pin the credential file location                       |

Tokens, URLs and repository paths work here too, if you prefer.

```bash
cp .env.example .env   # documents every key, with the gotchas
```

`.env` is gitignored — keep it that way.

## Run it from anywhere

Install the CLI once:

```bash
cd recap
npm link
```

Then, from any directory:

```bash
recap                 # your real sources, opens the browser automatically
recap --demo          # generated sample data, no credentials needed
recap --port 4400     # a different port
recap --no-open       # do not launch a browser
recap --help
```

Configuration is always read from the installed package — its `.env` and its credential file — never from whatever
directory you happen to be in, so `recap`
behaves identically from anywhere. To remove the command later:
`npm unlink -g recap`.

## Demo Mode is a launch mode

`npm run start:demo` (or `recap --demo`) starts a process that serves fixtures and never touches the network. A normal
`npm start` serves real data and shows no demo switch at all — there is no way to make a live server display invented
activity, so a screenshot is never ambiguous about which one you are looking at.

## What it does

- **Timeframes** — Yesterday, Last 7 Days, This Week, This Month, or a custom range picked on a calendar.
- **Summary cards** for commits, merge requests, tickets and docs. Click one to filter the timeline to that source.
- **Unified timeline** grouped by day, colour-coded per source, with branch names, `+`/`−` line counts, ticket status
  and pipeline state.
- **Copy for Standup** — Markdown grouped into Shipped / In progress / Code / Docs / Numbers. Copy to clipboard or
  export `.md`.
- **Honest failure states.** If Jira is down you get a "partial results" banner naming what failed, not a blank page or
  a silent zero.
- **Connection check** in Settings — one authenticated request per source, with the provider's own error message and a
  specific fix.

## Nothing is stored

*Activity* is fetched on demand and lives in memory for the session only. There is no database and no history — closing
the app discards every commit, ticket and page it fetched.

The only things that persist are your credentials (in `.env` and/or the credential file described above, both by your
explicit choice) and the last timeframe you picked. Credentials are never written to browser storage.

## Troubleshooting: 401 from Jira or Confluence

Open **Settings → Test connections**. It reports the exact status and Atlassian's own message. The usual causes, in
order of how often they bite:

1. **You created a scoped token.** Atlassian's token page now offers *"Create API token with scopes"*. Those tokens
   start with `ATCTT` and only work against `api.atlassian.com/ex/jira/{cloudId}` — against your own site URL they
   always answer 401. Use plain **"Create API token"** instead; a classic token starts with `ATATT`.
2. **Wrong email.** It must be the Atlassian *account* email exactly as shown
   at [your profile](https://id.atlassian.com/manage-profile/profile-and-visibility). An alias or a group address is
   rejected.
3. **Token belongs to a different account** than the email you paired it with.
4. **Truncated paste.** The token is shown once; a short copy looks identical to a wrong one.
5. **Password instead of a token.** Basic auth with an account password is disabled on Atlassian Cloud.

A **404** from Confluence almost always means `CONFLUENCE_BASE_URL` is missing the `/wiki` suffix. A **403** usually
means the account lacks a product licence for that product, or Atlassian is showing a CAPTCHA after repeated failed
logins — sign in through a browser once to clear it.

Tokens are managed at
<https://id.atlassian.com/manage-profile/security/api-tokens>.

## Layout

```
recap/
├── bin/recap.js            global CLI entry point
├── shared/contracts.ts     the HTTP contract, imported by server AND web
├── server/                 Express API in TypeScript → compiled to dist/
│   ├── index.ts            routes + per-source failure isolation
│   ├── config.ts           .env + runtime overrides (secrets never leave)
│   ├── adapters/           git · gitlab · jira · confluence
│   ├── lib/credentialStore.ts  the 0600 credential file, and where it may live
│   ├── lib/diagnose.ts     credential troubleshooting
│   └── mock/mock-data.ts   Demo Mode fixtures
├── web/                    Vue 3 + TypeScript frontend (Vite)
│   └── src/
│       ├── domain/         pure business logic, no framework
│       ├── application/    ports + use cases
│       ├── infrastructure/ HTTP and storage adapters
│       └── presentation/   Pinia stores + components
├── SPEC.md                 what it does and why
└── CLAUDE.md               rules for AI agents working here
```

Both halves are TypeScript and share `shared/contracts.ts`, so the client and the server cannot disagree about a
response shape without failing to compile.

## Development

```bash
npm run dev          # Vite dev server on :5173 with HMR, proxies /api → :4319
npm run dev:server   # the API it proxies to, tsx watch (second terminal)
npm run typecheck    # web, server and the CLI — all three must be clean
npm run build        # vite → web/dist, tsc → dist/
```

## Not built yet

**Retro summary** and **Review planner** appear in the UI as *Coming soon*
previews with disabled actions.
