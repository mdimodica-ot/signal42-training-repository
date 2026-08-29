/**
 * The HTTP contract between the Express server and the Vue client.
 *
 * Both sides import these types, so a change to a response shape is a compile
 * error on the consumer rather than `undefined` at runtime. This file is the
 * single place the wire format is described; neither side may redeclare it.
 *
 * It is pure types — nothing here emits JavaScript.
 */

export const SOURCE_KEYS = ['git', 'gitlab', 'jira', 'confluence'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export type EventKind = 'commit' | 'merge_request' | 'issue' | 'ticket' | 'page';

/**
 * How precisely the source knew *when* something happened. Some surfaces
 * report only a date, and inventing a clock time would sort those events
 * above real ones.
 */
export type TimePrecision = 'exact' | 'day';

export type FailureCode =
	| 'not-configured'
	| 'token'
	| 'forbidden'
	| 'not-found'
	| 'rate-limit'
	| 'timeout'
	| 'unreachable'
	| 'error';

/** Source-specific extras, rendered as small tags under a timeline row. */
export interface EventMeta {
	iid?: number;
	key?: string;
	state?: string;
	sha?: string;
	branch?: string;
	author?: string;
	authorEmail?: string;
	sourceBranch?: string;
	targetBranch?: string;
	draft?: boolean;
	insertions?: number | null;
	deletions?: number | null;
	files?: number;
	approvals?: number | null;
	pipeline?: string | null;
	status?: string | null;
	statusCategory?: string | null;
	issueType?: string | null;
	priority?: string | null;
	labels?: string[];
	space?: string | null;
	spaceName?: string | null;
	version?: number | null;
	authoredByMe?: boolean;
	pageAuthor?: string | null;
	note?: string;
}

/** One thing that happened, normalised across all four sources. */
export interface ActivityEventDto {
	id: string;
	source: SourceKey;
	kind: EventKind;
	action: string;
	title: string;
	url: string | null;
	/** ISO-8601 instant. */
	timestamp: string;
	precision: TimePrecision;
	project: string | null;
	meta: EventMeta;
}

export interface ActivitySummaryDto {
	total: number;
	commits: number;
	mrsMerged: number;
	mrsOpen: number;
	ticketsResolved: number;
	ticketsTouched: number;
	docsCreated: number;
	docsEdited: number;
	linesAdded: number;
	linesRemoved: number;
	repos: number;
}

export interface SourceStatusDto {
	key: SourceKey;
	ok: boolean;
	status?: number;
	code?: FailureCode;
	error?: string;
	hint?: string | null;
	count: number;
	ms?: number;
	warnings?: string[];
}

export interface ActivityResponse {
	demo: boolean;
	/** ISO instants: local start-of-day and end-of-day for the chosen range. */
	range: { from: string; to: string };
	events: ActivityEventDto[];
	summary: ActivitySummaryDto;
	sources: SourceStatusDto[];
	fetchedAt: string;
}

/* ------------------------------------------------------------------ config */

/**
 * Where a value currently comes from, in priority order:
 *
 *   session — typed this session, memory only, lost on restart
 *   stored  — the 0600 credential file, survives a restart
 *   env     — `.env`, hand-authored, survives a restart
 */
export type TokenOrigin = 'session' | 'stored' | 'env' | 'none';

/**
 * Deliberately contains no token VALUES — only whether one is set. Nothing the
 * client never receives can leak from it.
 */
export interface AppSettingsDto {
	demo: boolean;
	connected: Record<SourceKey, boolean>;
	connectedCount: number;
	/** Whether "Clear stored tokens" has anything to remove. */
	clearable: boolean;
	/** Whether any secret comes from `.env`, which clearing must not touch. */
	envBacked: boolean;
	/** Whether credentials are currently saved to disk by Recap itself. */
	remembered: boolean;
	/**
	 * Where the credential file lives, and the platform default — both with the
	 * home directory collapsed to `~`.
	 *
	 * Only these forms cross the wire. An absolute path embeds the account name,
	 * which would then travel into screenshots, shared screens and devtools
	 * captures. Collapsing only ever replaces a prefix, so equality between two
	 * display strings still implies equality of the real paths, and the UI can
	 * compare them safely.
	 */
	storePathDisplay: string;
	storePathDefaultDisplay: string;
	/** True when RECAP_CREDENTIALS_PATH pins the location, so the UI cannot change it. */
	storePathLocked: boolean;
	git: { repos: string[]; author: string };
	gitlab: { baseUrl: string; hasToken: boolean; tokenOrigin: TokenOrigin; enrich: boolean };
	jira: { baseUrl: string; email: string; hasToken: boolean; tokenOrigin: TokenOrigin };
	confluence: { baseUrl: string; email: string; hasToken: boolean; tokenOrigin: TokenOrigin };
}

/** Keys the Settings drawer may write. Anything else in a POST body is ignored. */
export const WRITABLE_KEYS = [
	'RECAP_GIT_REPOS',
	'RECAP_GIT_AUTHOR',
	'GITLAB_BASE_URL',
	'GITLAB_TOKEN',
	'JIRA_BASE_URL',
	'JIRA_EMAIL',
	'JIRA_API_TOKEN',
	'CONFLUENCE_BASE_URL',
	'CONFLUENCE_EMAIL',
	'CONFLUENCE_API_TOKEN',
] as const;

export type WritableKey = (typeof WRITABLE_KEYS)[number];
export type CredentialsPatch = Partial<Record<WritableKey, string>>;

/** Body of POST /api/config. */
export interface SaveSettingsRequest {
	values: CredentialsPatch;
	/**
	 * Persist to the on-disk credential store (0600, outside the repo) instead
	 * of holding the values in server memory for this session only.
	 */
	remember: boolean;
	/**
	 * Where to keep the credential file. A directory or a full file path; `~` is
	 * expanded. Empty or omitted means the platform default.
	 */
	storePath?: string;
}

/** Returned with 4xx/5xx from POST /api/config. */
export interface SettingsError {
	error: string;
	/** Which input to attach the message to, when it is one field's fault. */
	field?: 'storePath';
}

/** POST /api/config resolves the path before saving; the UI previews it live. */
export interface ResolvePathResponse {
	ok: boolean;
	/** Resolved location, home-collapsed. The absolute form stays server-side. */
	display: string;
	error?: string;
}

/* ------------------------------------------------------------- diagnostics */

export interface DiagnosticCheck {
	source: SourceKey;
	state: 'ok' | 'failed' | 'skipped';
	status?: number;
	detail: string;
	/** The provider's own error text, when it said anything useful. */
	providerMessage?: string;
	remedies: string[];
}

export interface DiagnoseResponse {
	demo: boolean;
	checks: DiagnosticCheck[];
}
