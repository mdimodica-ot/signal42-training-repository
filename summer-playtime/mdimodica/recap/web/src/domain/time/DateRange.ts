import {LocalDay} from './LocalDay';

/** An inclusive span of calendar days. Always ordered: `from` <= `to`. */
export class DateRange {
	private constructor(
		readonly from: LocalDay,
		readonly to: LocalDay,
	) {
	}

	get dayCount(): number {
		return this.from.daysUntil(this.to) + 1;
	}

	/** One day carries no comparison; several panels use this to hide themselves. */
	get isSingleDay(): boolean {
		return this.dayCount === 1;
	}

	/** Orders the endpoints, so "clicked the end date first" is not an error. */
	static between(a: LocalDay, b: LocalDay): DateRange {
		return a.isAfter(b) ? new DateRange(b, a) : new DateRange(a, b);
	}

	static singleDay(day: LocalDay): DateRange {
		return new DateRange(day, day);
	}

	/**
	 * The server reports a range as two ISO instants (local midnight and local
	 * end-of-day, serialised as UTC). Both are real points in time, so reading
	 * their local calendar day is the correct round trip.
	 */
	static fromInstants(from: string, to: string): DateRange {
		return DateRange.between(LocalDay.parse(from), LocalDay.parse(to));
	}

	contains(day: LocalDay): boolean {
		return !day.isBefore(this.from) && !day.isAfter(this.to);
	}

	/** Every day in the range, in order. */
	days(): LocalDay[] {
		const out: LocalDay[] = [];
		for (let i = 0; i < this.dayCount; i += 1) out.push(this.from.addDays(i));
		return out;
	}

	/** "12 – 18 Aug 2026", collapsing the parts the two ends have in common. */
	describe(): string {
		if (this.isSingleDay) {
			return this.from.format({weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
		}
		const sameYear = this.from.year === this.to.year;
		const sameMonth = sameYear && this.from.month === this.to.month;
		const start = sameMonth
			? this.from.format({day: 'numeric'})
			: this.from.format(sameYear ? {day: 'numeric', month: 'short'} : {
				day: 'numeric',
				month: 'short',
				year: 'numeric'
			});
		const end = this.to.format({day: 'numeric', month: 'short', year: 'numeric'});
		return `${start} – ${end}`;
	}
}
