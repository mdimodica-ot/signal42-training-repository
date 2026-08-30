import type {ActivityEventDto} from '../../shared/contracts.js';
import type {GitLabConfig} from '../config.js';
import {makeEvent} from '../lib/events.js';
import {getJson, SourceError} from '../lib/http.js';
import type {AdapterResult, DateWindow} from './types.js';

/**
 * GitLab adapter — merge requests and issues authored by the current user.
 *
 * Endpoints (GitLab REST v4):
 *   GET /api/v4/merge_requests?scope=created_by_me&...  -> MRs
 *   GET /api/v4/issues?scope=created_by_me&...          -> issues
 *
 * NOTE ON DIFF STATS: the merge-request *list* response does not include
 * added/removed line counts or approval counts. The design shows both. Getting
 * them costs one extra request per MR. That N+1 is opt-in via GITLAB_ENRICH=1;
 * when off, the UI omits those tags rather than showing zeros.
 */

interface GitLabMergeRequest {
	id: number;
	iid: number;
	title: string;
	state: string;
	web_url: string;
	project_id: number;
	source_branch?: string;
	target_branch?: string;
	draft?: boolean;
	work_in_progress?: boolean;
	merged_at?: string | null;
	closed_at?: string | null;
	created_at?: string;
	updated_at?: string;
	pipeline?: { status?: string } | null;
	head_pipeline?: { status?: string } | null;
}

interface GitLabIssue {
	id: number;
	iid: number;
	title: string;
	state: string;
	web_url: string;
	labels?: string[];
	closed_at?: string | null;
	created_at?: string;
	updated_at?: string;
}

interface MrExtras {
	insertions: number | null;
	deletions: number | null;
	approvals: number | null;
}

export async function fetchGitLab(
	{baseUrl, token, enrich}: GitLabConfig,
	{from, to}: DateWindow,
): Promise<AdapterResult> {
	if (!baseUrl || !token) {
		throw new SourceError('GitLab not configured', {code: 'not-configured'});
	}

	const api = `${baseUrl}/api/v4`;
	const headers = {'PRIVATE-TOKEN': token};
	const options = {headers, label: 'GitLab'};

	const since = new Date(from).toISOString();
	const until = new Date(to).toISOString();
	const window = `updated_after=${since}&updated_before=${until}&per_page=100&order_by=updated_at`;

	const [mrs, issues] = await Promise.all([
		getJson<GitLabMergeRequest[]>(
			`${api}/merge_requests?scope=created_by_me&state=all&${window}`,
			options,
		),
		getJson<GitLabIssue[]>(`${api}/issues?scope=created_by_me&state=all&${window}`, options),
	]);

	const extras = enrich ? await enrichMrs(api, headers, mrs) : new Map<number, MrExtras>();

	const events: ActivityEventDto[] = [
		...mrs.map((mr) => mrEvent(mr, extras.get(mr.id))),
		...issues.map(issueEvent),
	];

	const warnings: string[] = [];
	if (!enrich && mrs.length) {
		warnings.push('MR line counts and approvals omitted (set GITLAB_ENRICH=1 to fetch them)');
	}

	return {events, warnings};
}

function mrEvent(mr: GitLabMergeRequest, extra: MrExtras | undefined): ActivityEventDto {
	// An MR's most meaningful moment: merged > closed > created.
	const action = mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'opened';
	const timestamp = mr.merged_at || mr.closed_at || mr.created_at || mr.updated_at;

	return makeEvent({
		id: `gitlab:mr:${mr.id}`,
		source: 'gitlab',
		kind: 'merge_request',
		action,
		title: `!${mr.iid} ${mr.title}`,
		url: mr.web_url,
		timestamp: timestamp ?? '',
		project: projectFromUrl(mr.web_url),
		meta: {
			iid: mr.iid,
			state: mr.state,
			sourceBranch: mr.source_branch,
			targetBranch: mr.target_branch,
			draft: Boolean(mr.draft || mr.work_in_progress),
			insertions: extra?.insertions ?? null,
			deletions: extra?.deletions ?? null,
			approvals: extra?.approvals ?? null,
			pipeline: mr.pipeline?.status || mr.head_pipeline?.status || null,
		},
	});
}

function issueEvent(issue: GitLabIssue): ActivityEventDto {
	return makeEvent({
		id: `gitlab:issue:${issue.id}`,
		source: 'gitlab',
		kind: 'issue',
		action: issue.state === 'closed' ? 'closed' : 'opened',
		title: `#${issue.iid} ${issue.title}`,
		url: issue.web_url,
		timestamp: issue.closed_at || issue.created_at || issue.updated_at || '',
		project: projectFromUrl(issue.web_url),
		meta: {iid: issue.iid, state: issue.state, labels: issue.labels ?? []},
	});
}

/** Best-effort project slug from an MR/issue web_url. */
function projectFromUrl(webUrl: string | undefined): string | null {
	if (!webUrl) return null;
	const match = /^https?:\/\/[^/]+\/(.+?)\/-\//.exec(webUrl);
	if (!match?.[1]) return null;
	const parts = match[1].split('/');
	return parts[parts.length - 1] ?? null;
}

interface ChangesResponse {
	changes?: { diff?: string }[];
}

interface ApprovalsResponse {
	approved_by?: unknown[];
}

/**
 * Opt-in N+1: fetch diff stats + approvals per MR, with bounded concurrency so
 * we don't open 40 sockets at once against a self-hosted instance.
 */
async function enrichMrs(
	api: string,
	headers: Record<string, string>,
	mrs: readonly GitLabMergeRequest[],
): Promise<Map<number, MrExtras>> {
	const CONCURRENCY = 5;
	const out = new Map<number, MrExtras>();
	const queue = [...mrs];

	async function worker(): Promise<void> {
		for (; ;) {
			const mr = queue.shift();
			if (!mr) return;

			const [changes, approvals] = await Promise.allSettled([
				getJson<ChangesResponse>(
					`${api}/projects/${mr.project_id}/merge_requests/${mr.iid}/changes`,
					{headers, label: 'GitLab'},
				),
				getJson<ApprovalsResponse>(
					`${api}/projects/${mr.project_id}/merge_requests/${mr.iid}/approvals`,
					{headers, label: 'GitLab'},
				),
			]);

			const entry: MrExtras = {insertions: null, deletions: null, approvals: null};

			if (changes.status === 'fulfilled' && Array.isArray(changes.value.changes)) {
				// GitLab returns per-file diffs, not totals; count the +/- lines.
				let added = 0;
				let removed = 0;
				for (const change of changes.value.changes) {
					for (const line of (change.diff ?? '').split('\n')) {
						if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
						else if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
					}
				}
				entry.insertions = added;
				entry.deletions = removed;
			}

			if (approvals.status === 'fulfilled') {
				entry.approvals = (approvals.value.approved_by ?? []).length;
			}

			out.set(mr.id, entry);
		}
	}

	await Promise.all(Array.from({length: Math.min(CONCURRENCY, mrs.length)}, worker));
	return out;
}
