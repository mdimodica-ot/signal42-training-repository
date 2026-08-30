import type {ActivityEventDto} from '../../shared/contracts.js';
import {type AtlassianConfig, basicAuth} from '../config.js';
import {makeEvent} from '../lib/events.js';
import {getJson, SourceError} from '../lib/http.js';
import type {AdapterResult, DateWindow} from './types.js';

/**
 * Confluence Cloud adapter.
 *
 * GET /wiki/rest/api/content/search?cql=...&expand=version,space,history
 *
 * TWO THINGS WORTH KNOWING
 *
 * 1. `contributor = currentUser()` matches pages you *edited*, not only pages
 *    you authored. On a real tenant this returned pages created by other
 *    people that the user had merely touched. Reporting those as "your work"
 *    overstates output, so we compare `history.createdBy` against the current
 *    account and emit action 'created' vs 'edited' accordingly. The UI shows
 *    them differently and the standup groups them separately.
 *
 * 2. Timestamps: `version.when` from this REST endpoint is a full ISO-8601
 *    instant, so page events get `precision: 'exact'`. (Atlassian's *search*
 *    surfaces sometimes expose only a day-granular "Aug 12, 2026" string; if
 *    `version.when` is ever missing we degrade to `precision: 'day'` rather
 *    than inventing a time.)
 */

interface ConfluencePage {
	id: string;
	title: string;
	version?: { when?: string; number?: number };
	space?: { key?: string; name?: string };
	history?: {
		createdDate?: string;
		createdBy?: { accountId?: string; displayName?: string };
		lastUpdated?: { when?: string };
	};
	_links?: { webui?: string };
}

interface ContentSearchResponse {
	results?: ConfluencePage[];
}

export async function fetchConfluence(
	{baseUrl, email, token}: AtlassianConfig,
	{from, to}: DateWindow,
): Promise<AdapterResult> {
	if (!baseUrl || !email || !token) {
		throw new SourceError('Confluence not configured', {code: 'not-configured'});
	}

	const headers = {Authorization: basicAuth(email, token)};

	// Credential preflight, for the same reason as the Jira adapter: prove the
	// token before trusting an empty result set. This also gives us the account
	// id needed to tell "pages I wrote" from "pages I merely edited".
	const myAccountId = await currentAccountId(baseUrl, headers);

	// CQL dates are yyyy-MM-dd. It is a *day* filter, so we widen by one day on
	// each end and re-filter precisely by timestamp afterwards.
	const cql =
		`type = page AND contributor = currentUser() ` +
		`AND lastmodified >= "${cqlDate(from, -1)}" AND lastmodified <= "${cqlDate(to, 1)}" ` +
		`ORDER BY lastmodified DESC`;

	const url = new URL(`${baseUrl}/rest/api/content/search`);
	url.searchParams.set('cql', cql);
	url.searchParams.set('limit', '100');
	url.searchParams.set('expand', 'version,space,history');

	const page = await getJson<ContentSearchResponse>(url.toString(), {
		headers,
		label: 'Confluence',
	});

	const events = (page.results ?? [])
		.map((result) => pageEvent(result, baseUrl, myAccountId))
		.filter((event): event is ActivityEventDto => event !== null);

	return {events, warnings: []};
}

function pageEvent(
	page: ConfluencePage,
	baseUrl: string,
	myAccountId: string | null,
): ActivityEventDto | null {
	const when = page.version?.when || page.history?.lastUpdated?.when;
	const created = page.history?.createdDate;

	const createdByMe =
		myAccountId != null && page.history?.createdBy?.accountId != null
			? page.history.createdBy.accountId === myAccountId
			: false;

	// If the page was created inside this window by *me*, that is the headline.
	const isCreation = Boolean(createdByMe && created && when && sameInstant(created, when));

	const timestamp = when || created;
	if (!timestamp) return null;

	const webui = page._links?.webui ?? '';
	const siteRoot = baseUrl.replace(/\/wiki$/, '');

	return makeEvent({
		id: `confluence:${page.id}:${page.version?.number ?? 0}`,
		source: 'confluence',
		kind: 'page',
		action: isCreation ? 'created' : 'edited',
		title: `${isCreation ? 'Created' : 'Updated'} “${page.title}”`,
		url: webui ? `${siteRoot}/wiki${webui}` : null,
		timestamp,
		precision: when ? 'exact' : 'day',
		project: page.space?.key ?? null,
		meta: {
			space: page.space?.key ?? null,
			spaceName: page.space?.name ?? null,
			version: page.version?.number ?? null,
			authoredByMe: createdByMe,
			pageAuthor: page.history?.createdBy?.displayName ?? null,
		},
	});
}

function sameInstant(a: string, b: string): boolean {
	return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 1000;
}

async function currentAccountId(
	baseUrl: string,
	headers: Record<string, string>,
): Promise<string | null> {
	const me = await getJson<{ accountId?: string }>(`${baseUrl}/rest/api/user/current`, {
		headers,
		label: 'Confluence',
	});
	return me.accountId ?? null;
}

function cqlDate(value: string, dayOffset = 0): string {
	const date = new Date(value);
	date.setDate(date.getDate() + dayOffset);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
