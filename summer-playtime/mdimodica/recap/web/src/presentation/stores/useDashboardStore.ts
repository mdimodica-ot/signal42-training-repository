import {defineStore} from 'pinia';
import {computed, ref, shallowRef} from 'vue';

import {container} from '@/composition';
import {ActivityFeed} from '@/domain/activity/ActivityFeed';
import {type ActivitySummary, EMPTY_SUMMARY} from '@/domain/activity/ActivitySummary';
import type {SourceKey} from '@/domain/activity/SourceKey';
import {SourceHealth} from '@/domain/health/SourceStatus';
import {DateRange} from '@/domain/time/DateRange';
import {LocalDay} from '@/domain/time/LocalDay';
import {StandupReport} from '@/domain/standup/StandupReport';
import {type PresetId, Timeframe} from '@/domain/time/Timeframe';

/**
 * Which screen the dashboard is showing.
 *
 * `setup` and `error` are distinct on purpose: "you have not connected
 * anything yet" is a normal first run, while "everything you connected
 * failed" is a problem. Collapsing them would greet new users with a red
 * error page.
 */
export type DashboardStatus = 'loading' | 'ready' | 'empty' | 'error' | 'setup';

export const useDashboardStore = defineStore('dashboard', () => {
	const status = ref<DashboardStatus>('loading');
	const timeframe = shallowRef<Timeframe>(Timeframe.preset('7d'));
	const feed = shallowRef<ActivityFeed>(ActivityFeed.empty());
	const health = shallowRef<SourceHealth>(SourceHealth.empty());
	const summary = shallowRef<ActivitySummary>(EMPTY_SUMMARY);
	const range = shallowRef<DateRange>(DateRange.singleDay(LocalDay.today()));
	const isDemo = ref(false);

	/* --------------------------------------------------------------- getters */

	const visibleEvents = computed(() => feed.value.visible);
	const dayGroups = computed(() => feed.value.groupByDay());
	const isFiltered = computed(() => feed.value.isFiltered);
	const activeFilters = computed(() => feed.value.activeFilters);

	/** A one-day range has nothing to compare, so the bar chart hides itself. */
	const showsDailyChart = computed(() => !range.value.isSingleDay);
	const dailyCounts = computed(() => feed.value.dailyCounts(range.value));

	const standupMarkdown = computed(() =>
		StandupReport.from(visibleEvents.value, range.value).toMarkdown(),
	);

	const standupFileName = computed(() => StandupReport.fileName(range.value));

	/* ---------------------------------------------------------------- actions */

	function restorePreferredTimeframe(): void {
		const preset = container.preferences.read().preset;
		if (preset) timeframe.value = Timeframe.preset(preset);
	}

	/** The setup screen; nothing is fetched until at least one source exists. */
	function showSetup(): void {
		status.value = 'setup';
	}

	async function load(): Promise<void> {
		status.value = 'loading';

		const snapshot = await container.loadActivity.execute(timeframe.value);

		isDemo.value = snapshot.demo;
		feed.value = ActivityFeed.of(snapshot.events);
		summary.value = snapshot.summary;
		health.value = snapshot.health;
		range.value = snapshot.range;

		if (snapshot.health.allFailed) status.value = 'error';
		else if (snapshot.events.length === 0) status.value = 'empty';
		else status.value = 'ready';
	}

	async function selectPreset(preset: PresetId): Promise<void> {
		timeframe.value = Timeframe.preset(preset);
		container.preferences.write({preset});
		await load();
	}

	async function selectRange(from: LocalDay, to: LocalDay): Promise<void> {
		timeframe.value = Timeframe.custom(DateRange.between(from, to));
		await load();
	}

	function toggleSourceFilter(source: SourceKey): void {
		feed.value = feed.value.toggleFilter(source);
	}

	function clearSourceFilter(): void {
		feed.value = feed.value.clearFilter();
	}

	return {
		status,
		timeframe,
		feed,
		health,
		summary,
		range,
		isDemo,

		visibleEvents,
		dayGroups,
		isFiltered,
		activeFilters,
		showsDailyChart,
		dailyCounts,
		standupMarkdown,
		standupFileName,

		restorePreferredTimeframe,
		showSetup,
		load,
		selectPreset,
		selectRange,
		toggleSourceFilter,
		clearSourceFilter,
	};
});
