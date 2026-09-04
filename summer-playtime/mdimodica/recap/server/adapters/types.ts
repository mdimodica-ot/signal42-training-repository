import type {ActivityEventDto} from '../../shared/contracts.js';

/** ISO instants bounding the requested range. */
export interface DateWindow {
	from: string;
	to: string;
}

/**
 * What every adapter returns.
 *
 * `warnings` are non-fatal: a repo path that does not exist, or MR stats that
 * were skipped. They are reported alongside a successful result rather than
 * thrown, so one missing repo does not blank the other three.
 */
export interface AdapterResult {
	events: ActivityEventDto[];
	warnings: string[];
}
