import type {DateRange} from './DateRange';

/**
 * What the user asked to see.
 *
 * Presets are resolved SERVER-side. The client sends the name, not two dates,
 * so the two can never disagree about where "this week" starts — a
 * disagreement that would show up as events mysteriously missing from an edge
 * of the range.
 */
export const PRESETS = ['yesterday', '7d', 'week', 'month'] as const;

export type PresetId = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<PresetId, string> = {
	yesterday: 'Yesterday',
	'7d': 'Last 7 Days',
	week: 'This Week',
	month: 'This Month',
};

/** Short form, for the bottom dock where space is tight. */
export const PRESET_SHORT: Record<PresetId, string> = {
	yesterday: 'yesterday',
	'7d': '7 days',
	week: 'this week',
	month: 'this month',
};

export type Timeframe =
	| { readonly kind: 'preset'; readonly preset: PresetId }
	| { readonly kind: 'custom'; readonly range: DateRange };

export const Timeframe = {
	preset(preset: PresetId): Timeframe {
		return {kind: 'preset', preset};
	},

	custom(range: DateRange): Timeframe {
		return {kind: 'custom', range};
	},

	isPreset(timeframe: Timeframe, preset: PresetId): boolean {
		return timeframe.kind === 'preset' && timeframe.preset === preset;
	},

	/** Query parameters for GET /api/activity. */
	toQuery(timeframe: Timeframe): Record<string, string> {
		if (timeframe.kind === 'custom') {
			return {from: timeframe.range.from.toISO(), to: timeframe.range.to.toISO()};
		}
		return {preset: timeframe.preset};
	},

	describe(timeframe: Timeframe): string {
		return timeframe.kind === 'custom' ? 'custom range' : PRESET_SHORT[timeframe.preset];
	},
};

export function isPresetId(value: unknown): value is PresetId {
	return typeof value === 'string' && (PRESETS as readonly string[]).includes(value);
}
