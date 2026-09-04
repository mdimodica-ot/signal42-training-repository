import type {ActivityEvent} from '@/domain/activity/ActivityEvent';
import type {ActivitySummary} from '@/domain/activity/ActivitySummary';
import type {SourceHealth} from '@/domain/health/SourceStatus';
import type {DateRange} from '@/domain/time/DateRange';
import type {Timeframe} from '@/domain/time/Timeframe';

/** One complete answer for one timeframe. Nothing is cached between calls. */
export interface ActivitySnapshot {
	readonly demo: boolean;
	readonly range: DateRange;
	readonly events: readonly ActivityEvent[];
	readonly summary: ActivitySummary;
	readonly health: SourceHealth;
	readonly fetchedAt: Date;
}

/**
 * The boundary between "what the app does" and "how activity is retrieved".
 *
 * Stores and use cases depend on this interface, never on `fetch`. That is
 * what lets the load path be exercised without a server, and what keeps HTTP
 * details out of the presentation layer.
 */
export interface ActivityGateway {
	fetch(timeframe: Timeframe): Promise<ActivitySnapshot>;
}
