import type {ActivityEventDto} from '../../shared/contracts.js';
import type {GitLabConfig} from '../config.js';
import {makeEvent} from '../lib/events.js';
import {getJson, SourceError} from '../lib/http.js';
import type {AdapterResult, DateWindow} from './types.js';

/**
 * GitLab adapter — merge requests authored by the current user.
 *
 * Endpoints (GitLab REST v4):
 *   GET /api/v4/merge_requests?scope=created_by_me&...  -> MRs
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

interface MrExtras {
	insertions: number | null;
	deletions: number | null;
	approvals: number | null;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

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
	const window = `updated_after=${since}&updated_before=${until}&per_page=${PAGE_SIZE}&order_by=updated_at`;
	const {mrs, truncated} = await fetchMergeRequests(api, window, options);

	const extras = enrich ? await enrichMrs(api, headers, mrs) : new Map<number, MrExtras>();
	const events = mrs.map((mr) => mrEvent(mr, extras.get(mr.id)));

	const warnings: string[] = [];
	if (truncated) warnings.push(`GitLab merge requests truncated at ${PAGE_SIZE * MAX_PAGES}`);
	if (!enrich && mrs.length) {
		warnings.push('MR line counts and approvals omitted (set GITLAB_ENRICH=1 to fetch them)');
	}

	return {events, warnings};
}

function mrEvent(mr: GitLabMergeRequest, extra: MrExtras | undefined): ActivityEventDto {
	// Closed MRs belong at their closing moment. Open MRs are selected by
	// updated_at, so use that same instant; otherwise an older MR touched during
	// this range would be fetched and then removed by the final range filter.
	const action = mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'opened';
	const timestamp =
		mr.state === 'merged'
			? mr.merged_at || mr.updated_at || mr.created_at
			: mr.state === 'closed'
				? mr.closed_at || mr.updated_at || mr.created_at
				: mr.updated_at || mr.created_at;

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

async function fetchMergeRequests(
	api: string,
	window: string,
	options: { headers: Record<string, string>; label: string },
): Promise<{ mrs: GitLabMergeRequest[]; truncated: boolean }> {
	const mrs: GitLabMergeRequest[] = [];

	for (let page = 1; page <= MAX_PAGES; page += 1) {
		const batch = await getJson<GitLabMergeRequest[]>(
			`${api}/merge_requests?scope=created_by_me&state=all&${window}&page=${page}`,
			options,
		);
		mrs.push(...batch);
		if (batch.length < PAGE_SIZE) return {mrs, truncated: false};
	}

	return {mrs, truncated: true};
}

/** Best-effort project slug from an MR web_url. */
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
