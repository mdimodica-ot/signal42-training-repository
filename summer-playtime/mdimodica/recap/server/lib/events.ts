import type {
	ActivityEventDto,
	ActivitySummaryDto,
	EventKind,
	EventMeta,
	SourceKey,
	TimePrecision,
} from '../../shared/contracts.js';
import {SOURCE_KEYS} from '../../shared/contracts.js';

/**
 * The unified activity event.
 *
 * Every adapter (git, gitlab, jira, confluence) normalises into this one shape
 * so the frontend renders a single timeline without knowing about any source.
 *
 * WHY `precision` EXISTS
 * ----------------------
 * Confluence's search API can return `lastModified` as a day-granular string
 * ("Aug 12, 2026") with no time component. We cannot honestly place those
 * events at a specific hour. Rather than fabricating 00:00 and letting them
 * silently sort above real morning commits, we tag them `precision: 'day'`.
 * The timeline sorts them to the END of their day and the UI renders the time
 * as "—" instead of a made-up clock value.
 */

export interface MakeEventInput {
	id: string;
	source: SourceKey;
	kind: EventKind;
	action: string;
	title: string;
	url?: string | null;
	timestamp: string | Date;
	precision?: TimePrecision;
	project?: string | null;
	meta?: EventMeta;
}

/** Build an event, validating the bits that are easy to get wrong. */
export function makeEvent(input: MakeEventInput): ActivityEventDto {
	const {
		id,
		source,
		kind,
		action,
		title,
		url = null,
		timestamp,
		precision = 'exact',
		project = null,
		meta = {},
	} = input;

	if (!SOURCE_KEYS.includes(source)) {
		throw new Error(`makeEvent: unknown source "${source}"`);
	}

	const iso = toIso(timestamp);
	if (!iso) {
		throw new Error(`makeEvent: unparseable timestamp "${String(timestamp)}" for ${id}`);
	}

	return {id, source, kind, action, title, url, timestamp: iso, precision, project, meta};
}

/** Tolerant date parsing. Returns an ISO string, or null if hopeless. */
export function toIso(value: string | Date | null | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Sort newest-first. Day-precision events sort to the end of their own day so
 * they never appear to precede a timestamped event that actually came later.
 */
export function sortEvents(events: readonly ActivityEventDto[]): ActivityEventDto[] {
	return [...events].sort((a, b) => sortKey(b) - sortKey(a));
}

function sortKey(event: ActivityEventDto): number {
	const time = new Date(event.timestamp).getTime();
	if (event.precision !== 'day') return time;
	// Push to 23:59:59.999 of that same UTC day.
	const end = new Date(event.timestamp);
	end.setUTCHours(23, 59, 59, 999);
	return end.getTime();
}

/**
 * Keep only events inside [from, to]. Day-precision events are kept if their
 * *day* overlaps the window, so a page edited on the boundary day is not lost
 * to an accident of the 00:00 default.
 */
export function filterByRange(
	events: readonly ActivityEventDto[],
	from: string,
	to: string,
): ActivityEventDto[] {
	const lo = new Date(from).getTime();
	const hi = new Date(to).getTime();

	return events.filter((event) => {
		if (event.precision === 'day') {
			const start = new Date(event.timestamp);
			start.setUTCHours(0, 0, 0, 0);
			const end = new Date(event.timestamp);
			end.setUTCHours(23, 59, 59, 999);
			return end.getTime() >= lo && start.getTime() <= hi;
		}
		const time = new Date(event.timestamp).getTime();
		return time >= lo && time <= hi;
	});
}

/** Headline numbers for the summary cards. */
export function summarise(events: readonly ActivityEventDto[]): ActivitySummaryDto {
	const count = (predicate: (event: ActivityEventDto) => boolean): number =>
		events.filter(predicate).length;

	return {
		total: events.length,
		commits: count((e) => e.kind === 'commit'),
		mrsMerged: count((e) => e.kind === 'merge_request' && e.action === 'merged'),
		mrsOpen: count((e) => e.kind === 'merge_request' && e.action === 'opened'),
		ticketsResolved: count((e) => e.kind === 'ticket' && e.action === 'resolved'),
		ticketsTouched: count((e) => e.kind === 'ticket'),
		// Split, because Confluence `contributor` matches pages you merely edited.
		docsCreated: count((e) => e.kind === 'page' && e.action === 'created'),
		docsEdited: count((e) => e.kind === 'page' && e.action === 'edited'),
		linesAdded: events.reduce((total, e) => total + (e.meta.insertions ?? 0), 0),
		linesRemoved: events.reduce((total, e) => total + (e.meta.deletions ?? 0), 0),
		repos: new Set(events.filter((e) => e.kind === 'commit').map((e) => e.project)).size,
	};
}
