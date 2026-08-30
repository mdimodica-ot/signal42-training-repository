import type {ActivityEventDto, EventKind, EventMeta, SourceKey, TimePrecision,} from '@shared/contracts';
import {LocalDay} from '../time/LocalDay';

export type {EventKind, EventMeta, TimePrecision};

/** One thing that happened, normalised across all four sources. */
export class ActivityEvent {
	private constructor(
		readonly id: string,
		readonly source: SourceKey,
		readonly kind: EventKind,
		readonly action: string,
		readonly title: string,
		readonly url: string | null,
		readonly occurredAt: Date,
		readonly precision: TimePrecision,
		readonly project: string | null,
		readonly meta: EventMeta,
	) {
	}

	get day(): LocalDay {
		return LocalDay.fromDate(this.occurredAt);
	}

	/**
	 * A day-precision event has no clock time to show. Rendering 00:00 would be
	 * inventing information the source never gave us, so it renders as a dash.
	 */
	get displayTime(): string {
		if (this.precision === 'day') return '—';
		return this.occurredAt.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
	}

	get hasExactTime(): boolean {
		return this.precision === 'exact';
	}

	/** Which colour a status badge should take. */
	get badgeTone(): 'merged' | 'closed' | 'open' | 'done' | 'review' {
		if (this.kind === 'merge_request') {
			if (this.action === 'merged') return 'merged';
			if (this.action === 'closed') return 'closed';
			return 'open';
		}
		if (this.kind === 'ticket') {
			if (this.meta.statusCategory === 'done' || this.action === 'resolved') return 'done';
			if (/review/i.test(this.meta.status ?? '')) return 'review';
			return 'open';
		}
		return this.action === 'closed' ? 'closed' : 'open';
	}

	static fromApi(dto: ActivityEventDto): ActivityEvent {
		return new ActivityEvent(
			dto.id,
			dto.source,
			dto.kind,
			dto.action,
			dto.title,
			dto.url ?? null,
			new Date(dto.timestamp),
			dto.precision ?? 'exact',
			dto.project ?? null,
			dto.meta ?? {},
		);
	}
}
