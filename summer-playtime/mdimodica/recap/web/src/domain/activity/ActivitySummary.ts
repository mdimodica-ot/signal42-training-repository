import type {ActivitySummaryDto} from '@shared/contracts';

/** Aggregate counts for the timeframe, computed server-side. */
export type ActivitySummary = ActivitySummaryDto;

export const EMPTY_SUMMARY: ActivitySummary = {
	total: 0,
	commits: 0,
	mrsMerged: 0,
	mrsOpen: 0,
	ticketsResolved: 0,
	ticketsTouched: 0,
	docsCreated: 0,
	docsEdited: 0,
	linesAdded: 0,
	linesRemoved: 0,
	repos: 0,
};
