# Recap — Specification

> "What did I actually do last week?"

Recap answers that question by pulling your activity out of the four places it lives — local Git, GitLab, Jira,
Confluence — and laying it out as one chronological timeline you can read in ten seconds or paste into Slack.

Built for the Summer Build Challenge. Runs entirely on your laptop.

---

## 1. Problem

Daily standup, sprint retro and status reports all need the same input: a truthful list of what you did over some
period. That list is scattered across commits, merge requests, tickets and doc edits, and reconstructing it by hand
means opening four tabs and scrolling. People end up under-reporting, or reciting only what they remember.

## 2. Non-goals

Deliberately out of scope, to keep the tool honest and cheap:

- **No database, no history.** Activity is fetched on demand and dropped when the process stops. There is no "last week
  vs this week" trend store.
- **No data mining, no scoring.** No productivity metrics, no "developer velocity". Recap fetches, filters by date, and
  formats. That is all.
- **No user accounts.** It runs on your machine, as you.
- **No hosting.** Zero budget, zero deployment.
- **No writes.** Every integration is read-only. Recap never comments on a ticket, pushes a branch or edits a page.

## 3. Architecture

```
browser — Vue 3 + TypeScript SPA, built by Vite into web/dist
   │  GET /api/activity?preset=7d
   ▼
Express + TypeScript server (Node 18+), compiled by tsc into dist/
   │
   ├── adapters/git.ts         child_process → `git log` (local, read-only)
   ├── adapters/gitlab.ts      REST v4,  PRIVATE-TOKEN header
   ├── adapters/jira.ts        REST v3,  Basic auth (email:api_token)
   ├── adapters/confluence.ts  REST v1,  Basic auth (email:api_token)
   ├── lib/credentialStore.ts  the 0600 credential file + path validation
   ├── lib/diagnose.ts         one auth probe per source, for troubleshooting
   └── mock/mock-data.ts       @faker-js/faker — Demo Mode, no network
```

One process serves both the API and the built frontend, on one port.
`npm install && npm run start:demo` is the whole setup.

Both halves are TypeScript, and `shared/contracts.ts` declares the HTTP contract once for both. A change to a response
shape is therefore a compile error in the consumer rather than an `undefined` at runtime.

### Frontend layering

The SPA is layered, with dependencies pointing inward only:

| Layer             | Contains                                                                                  | May depend on           |
|-------------------|-------------------------------------------------------------------------------------------|-------------------------|
| `domain/`         | `LocalDay`, `DateRange`, `ActivityEvent`, `ActivityFeed`, `SourceHealth`, `StandupReport` | nothing                 |
| `application/`    | port interfaces + use cases                                                               | `domain`                |
| `infrastructure/` | HTTP gateways, localStorage                                                               | `application`, `domain` |
| `presentation/`   | Pinia stores, Vue components                                                              | `application`, `domain` |

`domain/` is pure TypeScript: no Vue, no `fetch`, no browser API. That is what makes the rules testable in isolation,
and it is why business logic such as source filtering and day grouping lives in `ActivityFeed` rather than in the
timeline component — the timeline, the bar chart, the dock counter and the standup export all need the same answer.

`composition.ts` is the only file that names a concrete implementation, so a gateway can be swapped without touching a
store.

Why not Nuxt: Recap is a single view with no routing and no SEO surface, and it already has an Express server that needs
shell access for `git log`. Nuxt would add a second server runtime (Nitro) alongside it and a much larger dependency
tree, in exchange for features this app does not use.

### Unified event model

Every adapter normalises into one shape so the frontend never branches on source:

```js
{
    id, source, kind, action, title, url,
        timestamp,           // ISO-8601
        precision,           // 'exact' | 'day'   (see §6)
        project,
        meta
:
    { …
    }          // source-specific, rendered as small tags
}
```

`kind` ∈ `commit | merge_request | issue | ticket | page`.

### Failure isolation

Sources are fetched with `Promise.all` over individually-guarded jobs, so one dead integration cannot blank the
dashboard. Each source reports
`{ ok, status, code, error, count, ms }`, and the UI has a dedicated **partial results** state that names what failed
and shows the rest.

## 4. Configuration & secrets

Three layers, in priority order:

1. **Session** — typed into the Settings drawer with "Remember" off. Held in server memory; gone when the process stops.
2. **Credential file** — the same drawer with "Remember" on. The *server*
   writes it with mode `0600`, outside the repository. Survives a restart. The location defaults to
   `~/.config/recap/credentials.json`
   (`%APPDATA%\recap\` on Windows), is user-configurable in Settings, and can be pinned by `RECAP_CREDENTIALS_PATH`.

   Two guards. The path may not be relative, and it may not be **inside the project directory** — a secrets file under
   version control is the exact failure this whole design exists to prevent, and `.gitignore` cannot be relied on for a
   path the user invents at runtime.

   Where the file lives is itself recorded in a small pointer file at the platform default, because the store cannot
   tell you where the store is. The pointer holds a path and never a secret.
3. **`.env`** — hand-authored, next to `package.json`. **Optional.**
   `.env.example` documents every key.

   Once the credential file existed, `.env` stopped being necessary for credentials. It is deliberately kept anyway, for
   two reasons. It is the config-as-code path — scripted setup, dotfiles, a new machine — and it is the only place for
   the settings that are not credentials at all: `PORT`,
   `GITLAB_ENRICH`, and `RECAP_CREDENTIALS_PATH`. That last one cannot move into the credential file, because it says
   where the credential file is.

The layering means a value typed in the drawer temporarily overrides `.env`
without modifying the file.

**Why a server-side file rather than `localStorage`.** The browser only ever needed to persist tokens in order to
survive a *server* restart — a page reload was already covered, because the server process holds them. Solving a server
problem by writing secrets into the browser profile put them at rest where any extension with host access can read them,
and where Recap cannot set permissions. The server does the same job with a file it owns and can chmod.

**Why not write `.env` from the UI.** It is authored by hand and carries comments and ordering that a machine rewrite
would silently destroy. The credential file is machine-owned, so there is nothing of the user's to lose.

`.env` is in `.gitignore`. Tokens are **never** echoed back to the browser:
`GET /api/config` returns `hasToken: true|false` plus a `tokenOrigin`
(`session` | `stored` | `env` | `none`), never the value. The origin names the layer a value came from, so the UI can
say *where* a token is configured without ever holding it.

**Credentials are never stored in the browser.** `localStorage` carries the selected timeframe and nothing else.

Clearing tokens (`DELETE /api/config`) drops the session layer *and* deletes the credential file. It cannot and must not
touch `.env`. The confirmation dialog enumerates exactly what it will remove and states that `.env` survives, because
the dangerous outcome is someone assuming every credential is gone when it is not.

## 5. Data sources — verified behaviour

Each was checked against a real tenant before implementation. Hostnames are deliberately omitted from this repository.

| Source     | Endpoint                                   | Status                                             |
|------------|--------------------------------------------|----------------------------------------------------|
| Git        | `git log --numstat --no-merges`            | ✅ 91 commits over 30d across 2 local clones       |
| GitLab     | `/api/v4/merge_requests`, `/api/v4/issues` | ✅ host reachable (401 without token, as expected) |
| Jira       | `/rest/api/3/search/jql`                   | ✅ 40 issues over 30d                              |
| Confluence | `/rest/api/content/search` + CQL           | ✅ 7 pages over 90d                                |

### Known API traps (each has a guard in the code)

- **Jira `/rest/api/3/search` is retired** — it 410s. Use `/search/jql`, which is token-paginated, not offset-paginated.
- **Jira returns `200 {"issues":[]}` for a bad token**, not 401. Verified with a junk token. A rejected token would
  therefore be indistinguishable from a quiet week. Both the Jira and Confluence adapters run a credential preflight
  against `/myself` (resp. `/user/current`), which *does* 401.
- **Confluence `contributor = currentUser()` matches pages you merely edited**, including pages authored by other
  people. Recap compares the page author to your account id and reports `created` vs `edited` separately, so the docs
  count never overstates your output.
- **`new Date("2026-08-01")` parses as UTC midnight**, i.e. the previous day east of Greenwich. Both server and client
  parse and format calendar days from local components instead.
- **GitLab's MR list omits diff stats and approvals.** Fetching them costs one request per MR, so it is opt-in via
  `GITLAB_ENRICH=1`. When off, those tags are omitted rather than shown as zero.

## 6. Timestamp precision

Most events carry an exact instant. Confluence's *search* surfaces sometimes expose only a day ("Aug 12, 2026"). Rather
than fabricate `00:00` — which would sort a page edit above a real 09:00 commit — such events are tagged
`precision: 'day'`, sorted to the end of their day, and rendered with `—`
instead of a clock time.

## 7. Demo Mode

`npm run start:demo`, `recap --demo`, or `RECAP_DEMO=1`.

Demo is a property of **how the process was started**, not a runtime toggle. A live server renders no demo control at
all and ignores `?demo=1`, so there is no way to talk it into showing invented activity — a screenshot can never be
ambiguous about which one it came from. A demo server shows a static
"Demo data" badge for the same reason.

Makes **zero network calls** and needs **zero credentials**. Fixtures are generated with `@faker-js/faker` from a seed
derived from the date range, so the same window always produces the same recap — screenshots stay stable.

The generator guarantees at least one event from each of the four sources, plus one merged and one open MR, inside any
window. Pure randomness could otherwise leave a short range with no Confluence page, which reads as a broken integration
rather than a quiet week.

## 8. Interface

- **Timeframe**: Yesterday · Last 7 Days · This Week · This Month · Custom Range (single popover calendar with
  click-start/click-end range selection; future dates disabled).
- **Summary cards** — commits, merge requests, tickets, docs. Each card is a filter toggle; failed sources render `—`
  with the HTTP status.
- **Unified timeline** — grouped by day, source-coloured rail icons, badges for state, `+`/`−` line counts.
- **Right rail** — connected-source health, activity-by-day bars (hidden for single-day ranges, where one bar says
  nothing), and a carousel of upcoming features.
- **Copy for Standup** — Markdown grouped into Shipped / In progress / Code / Docs / Numbers, with clipboard copy and
  `.md` export.
- **Settings drawer** — URLs, tokens, local repo paths, a connection check, and a destructive "Clear stored tokens"
  action behind a confirmation.

### States

`loading` · `data` · `partial` · `empty` · `error` · `setup`

`setup` and `error` are deliberately distinct. "You have not connected anything yet" is a normal first run; "everything
you connected failed" is a problem. Collapsing them would greet a new user with a red error page.

On `setup` the header's timeframe controls are **hidden**: over an unconfigured app they are controls with nothing to
control, and pressing one fetches zero sources and returns to the same screen, which reads as the button being broken.

## 8b. Credential troubleshooting

`GET /api/diagnose` makes one authenticated request per configured source and returns the raw status, the provider's own
message, and specific remedies.

It exists because the timeline deliberately collapses failures into a short code so per-source status fits in a rail —
and `401 · token` is equally true of an expired token, the wrong account email, a password used instead of a token, and
a **scoped** Atlassian token (`ATCTT…`) used against a site URL, which only accepts **classic** tokens (`ATATT…`). The
token prefix is checked directly, so that last case is named rather than guessed at.

## 9. Product decisions worth knowing

- **Git commits are filtered by author.** Without a filter a shared repo returns the whole team's work — 391 commits
  instead of 91 in testing. Falls back to each repo's own `git config user.email`.
- **Merge commits are excluded** (`--no-merges`): they carry no authored change and read as noise.
- **Jira events anchor to `resolutiondate` when present**, otherwise `updated` — the resolution is the reportable
  moment.

## 10. Not built

`Retro summary` and `Review planner` are visible in the UI as **Coming soon**
previews with disabled actions. Review planner is specified as: take everything in **Done** on the board and group it by
discipline — Frontend, Backend, Full stack, Bugs.
