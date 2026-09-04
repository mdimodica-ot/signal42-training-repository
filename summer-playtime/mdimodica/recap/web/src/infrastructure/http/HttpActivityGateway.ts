import type {ActivityResponse} from '@shared/contracts';
import type {ActivityGateway, ActivitySnapshot} from '@/application/ports/ActivityGateway';
import {ActivityEvent} from '@/domain/activity/ActivityEvent';
import {SourceHealth, SourceStatus} from '@/domain/health/SourceStatus';
import {DateRange} from '@/domain/time/DateRange';
import {Timeframe} from '@/domain/time/Timeframe';
import {getJson} from './json';

/** Talks to GET /api/activity and maps the payload into domain objects. */
export class HttpActivityGateway implements ActivityGateway {
	async fetch(timeframe: Timeframe): Promise<ActivitySnapshot> {
		const dto = await getJson<ActivityResponse>('/api/activity', Timeframe.toQuery(timeframe));

		return {
			demo: dto.demo,
			range: DateRange.fromInstants(dto.range.from, dto.range.to),
			events: dto.events.map(ActivityEvent.fromApi),
			summary: dto.summary,
			health: SourceHealth.of(dto.sources.map(SourceStatus.fromApi)),
			fetchedAt: new Date(dto.fetchedAt),
		};
	}
}
