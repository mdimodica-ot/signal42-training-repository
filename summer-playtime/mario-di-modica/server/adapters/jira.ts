import type {ActivityEventDto} from '../../shared/contracts.js';
import {type AtlassianConfig, basicAuth} from '../config.js';
import {makeEvent} from '../lib/events.js';
import {getJson, SourceError} from '../lib/http.js';
import type {AdapterResult, DateWindow} from './types.js';

/**
 * Jira Cloud adapter.
 *
 * IMPORTANT: this uses `/rest/api/3/search/jql`, NOT `/rest/api/3/search`.
 * The latter was removed from Jira Cloud in 2025 and now 410s. The new
 * endpoint is token-paginated (`nextPageToken`) instead of offset-paginated,
 * and requires `fields` to be passed explicitly.
 */

const FIELDS = [
	'summary',
	'status',
	'issuetype',
	'priority',
	'project',
	'created',
	'updated',
	'resolutiondate',
];

/** A recap is not an export; stop well before pulling someone's whole backlog. */
const MAX_PAGES = 10;

interface JiraIssue {
	key: string;
	fields?: {
		summary?: string;
		status?: { name?: string; statusCategory?: { key?: string } };
		issuetype?: { name?: string };
		priority?: { name?: string };
		project?: { key?: string };
		created?: string;
		updated?: string;
		resolutiondate?: string | null;
	};
}

interface JiraSearchPage {
	issues?: JiraIssue[];
	nextPageToken?: string;
}

export async function fetchJira(
	{baseUrl, email, token}: AtlassianConfig,
	{from, to}: DateWindow,
): Promise<AdapterResult> {
	if (!baseUrl || !email || !token) {
		throw new SourceError('Jira not configured', {code: 'not-configured'});
	}

	const headers = {Authorization: basicAuth(email, token)};

	// CREDENTIAL PREFLIGHT — do not remove.
	// `/search/jql` answers 200 with {"issues":[]} when the token is wrong,
	// instead of 401. Verified against a real Atlassian Cloud site with a junk
	// token. Without this check a rejected token is indistinguishable from a
	// quiet week, and the dashboard would confidently report "no activity".
	// `/myself` does return 401, so we use it to prove the credentials first.
	await getJson(`${baseUrl}/rest/api/3/myself`, {headers, label: 'Jira'});

	// Jira's JQL date functions take "yyyy/MM/dd HH:mm" in the instance timezone.
	const jql =
		`assignee = currentUser() AND updated >= "${jqlDate(from)}" AND updated <= "${jqlDate(to)}" ` +
		`ORDER BY updated DESC`;

	const events: ActivityEventDto[] = [];
	let nextPageToken: string | undefined;
	let pages = 0;

	do {
		const url = new URL(`${baseUrl}/rest/api/3/search/jql`);
		url.searchParams.set('jql', jql);
		url.searchParams.set('maxResults', '100');
		url.searchParams.set('fields', FIELDS.join(','));
		if (nextPageToken) url.searchParams.set('nextPageToken', nextPageToken);

		const page = await getJson<JiraSearchPage>(url.toString(), {headers, label: 'Jira'});
		for (const issue of page.issues ?? []) {
			const event = issueEvent(issue, baseUrl);
			if (event) events.push(event);
		}

		nextPageToken = page.nextPageToken;
		pages += 1;
	} while (nextPageToken && pages < MAX_PAGES);

	return {
		events,
		warnings: pages >= MAX_PAGES ? ['Jira results truncated at 1000 issues'] : [],
	};
}

function issueEvent(issue: JiraIssue, baseUrl: string): ActivityEventDto | null {
	const fields = issue.fields ?? {};
	const resolved = fields.resolutiondate;

	// Prefer the resolution moment when there is one: that is the thing worth
	// reporting at standup. Otherwise fall back to last update.
	const timestamp = resolved || fields.updated || fields.created;
	if (!timestamp) return null;

	return makeEvent({
		id: `jira:${issue.key}`,
		source: 'jira',
		kind: 'ticket',
		action: resolved ? 'resolved' : 'updated',
		title: `${issue.key}: ${fields.summary || '(no summary)'}`,
		url: `${baseUrl}/browse/${issue.key}`,
		timestamp,
		project: fields.project?.key ?? null,
		meta: {
			key: issue.key,
			status: fields.status?.name ?? null,
			statusCategory: fields.status?.statusCategory?.key ?? null,
			issueType: fields.issuetype?.name ?? null,
			priority: fields.priority?.name ?? null,
		},
	});
}

function jqlDate(value: string): string {
	const date = new Date(value);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
