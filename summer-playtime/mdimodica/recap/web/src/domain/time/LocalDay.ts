/**
 * A calendar day in the user's own timezone.
 *
 * WHY THIS TYPE EXISTS
 *
 * "A day" was previously passed around as a raw string or `Date`, and the same
 * bug was introduced three separate times: `new Date('2026-08-10')` parses as
 * UTC midnight, and `toISOString().slice(0, 10)` converts back through UTC.
 * Anywhere east of Greenwich both operations shift the day backwards, so
 * clicking "10 Aug" in the calendar asked the server for 9 Aug.
 *
 * The conversion is only wrong at the boundary between a *day* (a label on a
 * wall calendar) and an *instant* (a point on the timeline). Making that
 * boundary a type means the mistake cannot be made implicitly: there is no way
 * to get from a `LocalDay` to a string except through `toISO()`, and no way in
 * except through constructors that read local components.
 *
 * Immutable. Every operation returns a new instance.
 */
export class LocalDay {
	private constructor(
		readonly year: number,
		readonly month: number, // 1-12, not the Date object's 0-11
		readonly day: number,
	) {
	}

	/** Monday = 0 … Sunday = 6, matching the calendar grid and the working week. */
	get weekdayIndex(): number {
		return (this.toDate().getDay() + 6) % 7;
	}

	/** Reads the LOCAL calendar components — never the UTC ones. */
	static fromDate(date: Date): LocalDay {
		return new LocalDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
	}

	/**
	 * Parse `YYYY-MM-DD`, or the local calendar day of a full ISO instant.
	 *
	 * Splitting the string by hand is the entire point: handing it to `Date` is
	 * the bug this class prevents.
	 */
	static parse(value: string): LocalDay {
		const text = value.trim();
		const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
		if (dayOnly) {
			return new LocalDay(Number(dayOnly[1]), Number(dayOnly[2]), Number(dayOnly[3]));
		}
		// A full instant ("2026-08-10T22:00:00.000Z") is a point in time, so it is
		// legitimate to convert it — the local day is what the user would call it.
		return LocalDay.fromDate(new Date(text));
	}

	static today(): LocalDay {
		return LocalDay.fromDate(new Date());
	}

	/** `YYYY-MM-DD`. Built from the stored components, not via UTC. */
	toISO(): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${this.year}-${pad(this.month)}-${pad(this.day)}`;
	}

	/** Local midnight at the start of this day. */
	toDate(): Date {
		return new Date(this.year, this.month - 1, this.day);
	}

	addDays(count: number): LocalDay {
		// Going through Date handles month and year rollover, including leap days.
		return LocalDay.fromDate(new Date(this.year, this.month - 1, this.day + count));
	}

	/** Negative when this day is earlier than `other`. */
	compare(other: LocalDay): number {
		return this.toDate().getTime() - other.toDate().getTime();
	}

	equals(other: LocalDay): boolean {
		return this.year === other.year && this.month === other.month && this.day === other.day;
	}

	isBefore(other: LocalDay): boolean {
		return this.compare(other) < 0;
	}

	isAfter(other: LocalDay): boolean {
		return this.compare(other) > 0;
	}

	/** Whole days from this day to `other`; negative when `other` is earlier. */
	daysUntil(other: LocalDay): number {
		const MS_PER_DAY = 86_400_000;
		return Math.round((other.toDate().getTime() - this.toDate().getTime()) / MS_PER_DAY);
	}

	format(options: Intl.DateTimeFormatOptions = {day: 'numeric', month: 'short'}): string {
		return this.toDate().toLocaleDateString('en-GB', options);
	}
}
