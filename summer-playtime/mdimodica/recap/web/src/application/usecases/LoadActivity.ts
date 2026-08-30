import type {ActivityGateway, ActivitySnapshot} from '../ports/ActivityGateway';
import {EMPTY_SUMMARY} from '@/domain/activity/ActivitySummary';
import {SourceHealth} from '@/domain/health/SourceStatus';
import {DateRange} from '@/domain/time/DateRange';
import {LocalDay} from '@/domain/time/LocalDay';
import type {Timeframe} from '@/domain/time/Timeframe';
import {ApiError} from '@/infrastructure/http/json';

/**
 * Fetch the activity for a timeframe.
 *
 * The one piece of logic worth isolating: a failure of the Recap server itself
 * is not the same as a failure of a data source, but the UI has only one
 * vocabulary for "something went wrong". This translates the former into the
 * latter so the error screen can render either without a special case.
 */
export class LoadActivity {
	constructor(private readonly gateway: ActivityGateway) {
	}

	async execute(timeframe: Timeframe): Promise<ActivitySnapshot> {
		try {
			return await this.gateway.fetch(timeframe);
		} catch (error) {
			const message =
				error instanceof ApiError && error.status === 0
					? 'The Recap server is not responding. Is it still running?'
					: error instanceof Error
						? error.message
						: 'Unknown error';

			const today = LocalDay.today();
			return {
				demo: false,
				range: DateRange.singleDay(today),
				events: [],
				summary: EMPTY_SUMMARY,
				health: SourceHealth.allUnreachable(message),
				fetchedAt: new Date(),
			};
		}
	}
}
