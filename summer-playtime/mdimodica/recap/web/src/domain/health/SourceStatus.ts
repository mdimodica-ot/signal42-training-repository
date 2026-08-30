import type {FailureCode, SourceKey, SourceStatusDto} from '@shared/contracts';
import {SOURCE_KEYS, SOURCES} from '../activity/SourceKey';

export type {FailureCode, SourceStatusDto};

/**
 * The outcome of asking one source for its events.
 *
 * "Not configured" is deliberately NOT a failure. A user with no Confluence
 * should see an untouched card, not a red one — treating the two the same
 * turns a normal setup into a permanent error state.
 */
export class SourceStatus {
	private constructor(
		readonly key: SourceKey,
		readonly ok: boolean,
		readonly httpStatus: number,
		readonly code: FailureCode | null,
		readonly error: string | null,
		readonly hint: string | null,
		readonly count: number,
		readonly durationMs: number,
		readonly warnings: readonly string[],
	) {
	}

	get notConfigured(): boolean {
		return !this.ok && this.code === 'not-configured';
	}

	/** A real problem: configured, attempted, and it went wrong. */
	get failed(): boolean {
		return !this.ok && !this.notConfigured;
	}

	get label(): string {
		return SOURCES[this.key].short;
	}

	/** "401 · token", or "12 · 340ms" when healthy. */
	get statusText(): string {
		if (this.ok) return `${this.count} · ${this.durationMs}ms`;
		if (this.notConfigured) return 'not configured';
		return [this.httpStatus || null, this.code].filter(Boolean).join(' · ');
	}

	get tone(): 'ok' | 'warn' | 'err' {
		if (this.ok) return 'ok';
		return this.notConfigured ? 'warn' : 'err';
	}

	static fromApi(dto: SourceStatusDto): SourceStatus {
		return new SourceStatus(
			dto.key,
			dto.ok,
			dto.status ?? 0,
			dto.code ?? null,
			dto.error ?? null,
			dto.hint ?? null,
			dto.count ?? 0,
			dto.ms ?? 0,
			dto.warnings ?? [],
		);
	}

	static unreachable(key: SourceKey, message: string): SourceStatus {
		return new SourceStatus(key, false, 0, 'unreachable', message, null, 0, 0, []);
	}
}

/** All four statuses together, so the shell can pick one overall state. */
export class SourceHealth {
	private constructor(private readonly statuses: readonly SourceStatus[]) {
	}

	get all(): readonly SourceStatus[] {
		return this.statuses;
	}

	get failed(): readonly SourceStatus[] {
		return this.statuses.filter((status) => status.failed);
	}

	get succeeded(): readonly SourceStatus[] {
		return this.statuses.filter((status) => status.ok);
	}

	get configured(): readonly SourceStatus[] {
		return this.statuses.filter((status) => !status.notConfigured);
	}

	get anyFailed(): boolean {
		return this.failed.length > 0;
	}

	/**
	 * Every source that was actually asked has failed. Distinct from "no
	 * events": nothing can be shown, so the shell renders the hard-error state
	 * instead of an empty timeline that would read as a quiet week.
	 */
	get allFailed(): boolean {
		return this.configured.length > 0 && this.succeeded.length === 0;
	}

	/** Some worked and some did not — the partial-results banner. */
	get isPartial(): boolean {
		return this.anyFailed && this.succeeded.length > 0;
	}

	get warnings(): readonly string[] {
		return this.statuses.flatMap((status) => status.warnings);
	}

	static of(statuses: readonly SourceStatus[]): SourceHealth {
		return new SourceHealth(statuses);
	}

	static allUnreachable(message: string): SourceHealth {
		return new SourceHealth(SOURCE_KEYS.map((key) => SourceStatus.unreachable(key, message)));
	}

	static empty(): SourceHealth {
		return new SourceHealth([]);
	}

	find(key: SourceKey): SourceStatus | undefined {
		return this.statuses.find((status) => status.key === key);
	}
}
