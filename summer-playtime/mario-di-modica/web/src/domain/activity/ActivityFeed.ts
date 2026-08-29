import type {DateRange} from '../time/DateRange';
import {LocalDay} from '../time/LocalDay';
import type {ActivityEvent} from './ActivityEvent';
import {SOURCE_KEYS, type SourceKey} from './SourceKey';

export interface DayGroup {
	readonly day: LocalDay;
	/** "Today", "Yesterday", or the weekday name. */
	readonly heading: string;
	readonly subheading: string;
	readonly events: readonly ActivityEvent[];
}

export interface DayCount {
	readonly day: LocalDay;
	readonly count: number;
}

/**
 * The set of events for one timeframe, plus the source filter applied to it.
 *
 * Filtering and grouping live here rather than in a component so that the
 * timeline, the bar chart, the dock counter and the standup export all agree
 * on what "visible" means. They previously each recomputed it.
 *
 * Immutable: filter changes return a new feed.
 */
export class ActivityFeed {
	private constructor(
		private readonly events: readonly ActivityEvent[],
		private readonly filter: ReadonlySet<SourceKey>,
	) {
	}

	get all(): readonly ActivityEvent[] {
		return this.events;
	}

	get visible(): readonly ActivityEvent[] {
		if (this.filter.size === 0) return this.events;
		return this.events.filter((event) => this.filter.has(event.source));
	}

	get isFiltered(): boolean {
		return this.filter.size > 0;
	}

	get activeFilters(): readonly SourceKey[] {
		return SOURCE_KEYS.filter((key) => this.filter.has(key));
	}

	static of(events: readonly ActivityEvent[]): ActivityFeed {
		return new ActivityFeed(events, new Set());
	}

	static empty(): ActivityFeed {
		return new ActivityFeed([], new Set());
	}

	isFilterActive(source: SourceKey): boolean {
		return this.filter.has(source);
	}

	/**
	 * Selecting every source is the same view as selecting none, so it collapses
	 * back to "no filter" — otherwise the "filtered" pill would claim a
	 * restriction that isn't restricting anything.
	 */
	toggleFilter(source: SourceKey): ActivityFeed {
		const next = new Set(this.filter);
		if (next.has(source)) next.delete(source);
		else next.add(source);
		if (next.size === SOURCE_KEYS.length) next.clear();
		return new ActivityFeed(this.events, next);
	}

	clearFilter(): ActivityFeed {
		return new ActivityFeed(this.events, new Set());
	}

	/** Total events per source, ignoring the current filter. */
	countBySource(source: SourceKey): number {
		return this.events.filter((event) => event.source === source).length;
	}

	/** Visible events grouped into consecutive calendar days, newest first. */
	groupByDay(): DayGroup[] {
		const buckets = new Map<string, ActivityEvent[]>();
		for (const event of this.visible) {
			const key = event.day.toISO();
			const bucket = buckets.get(key);
			if (bucket) bucket.push(event);
			else buckets.set(key, [event]);
		}

		return [...buckets.entries()].map(([iso, events]) => {
			const day = LocalDay.parse(iso);
			return {
				day,
				heading: describeDay(day),
				subheading: `${day.format({
					weekday: 'short',
					day: 'numeric',
					month: 'short'
				})} · ${plural(events.length, 'event')}`,
				events,
			};
		});
	}

	/**
	 * Visible events per day across `range`, including days with none.
	 * Capped to the most recent `limit` days: a month view would otherwise
	 * render 31 unreadable slivers.
	 */
	dailyCounts(range: DateRange, limit = 14): DayCount[] {
		const tally = new Map<string, number>();
		for (const event of this.visible) {
			const key = event.day.toISO();
			tally.set(key, (tally.get(key) ?? 0) + 1);
		}
		return range
			.days()
			.slice(-limit)
			.map((day) => ({day, count: tally.get(day.toISO()) ?? 0}));
	}
}

function describeDay(day: LocalDay): string {
	const today = LocalDay.today();
	if (day.equals(today)) return 'Today';
	if (day.equals(today.addDays(-1))) return 'Yesterday';
	return day.format({weekday: 'long'});
}

export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
