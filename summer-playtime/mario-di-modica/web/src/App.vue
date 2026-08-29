<script lang="ts" setup>
import {computed, onBeforeUnmount, onMounted} from 'vue';

import {useDashboardStore} from './presentation/stores/useDashboardStore';
import {useSettingsStore} from './presentation/stores/useSettingsStore';
import {useUiStore} from './presentation/stores/useUiStore';

import AppHeader from './presentation/components/layout/AppHeader.vue';
import PrivacyBanner from './presentation/components/layout/PrivacyBanner.vue';
import PartialResultsBanner from './presentation/components/layout/PartialResultsBanner.vue';
import BottomDock from './presentation/components/layout/BottomDock.vue';
import SummaryCards from './presentation/components/summary/SummaryCards.vue';
import ActivityTimeline from './presentation/components/timeline/ActivityTimeline.vue';
import SourcesPanel from './presentation/components/rail/SourcesPanel.vue';
import DailyActivityChart from './presentation/components/rail/DailyActivityChart.vue';
import FeatureCarousel from './presentation/components/rail/FeatureCarousel.vue';
import LoadingState from './presentation/components/states/LoadingState.vue';
import EmptyState from './presentation/components/states/EmptyState.vue';
import ErrorState from './presentation/components/states/ErrorState.vue';
import SetupState from './presentation/components/states/SetupState.vue';
import SettingsDrawer from './presentation/components/settings/SettingsDrawer.vue';
import StandupModal from './presentation/components/standup/StandupModal.vue';
import OverlayScrollbar from './presentation/components/ui/OverlayScrollbar.vue';

const dashboard = useDashboardStore();
const settings = useSettingsStore();
const ui = useUiStore();

const showsDashboard = computed(() => dashboard.status === 'ready');

/**
 * Timeframe controls are hidden until there is something to filter. On the
 * setup screen they would be live controls over an app with no sources: every
 * press fetches nothing and returns to the same screen.
 */
const showsFilters = computed(() => dashboard.status !== 'setup');

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') ui.closeTopmost();
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown);

  await settings.load();
  settings.openForm();
  dashboard.restorePreferredTimeframe();

  // Nothing connected and not a demo run: show setup instead of fetching
  // zero sources and rendering that as an empty week.
  if (settings.needsSetup) {
    dashboard.showSetup();
    return;
  }
  await dashboard.load();
});

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <AppHeader :show-filters="showsFilters"/>
  <PrivacyBanner/>

  <main class="wrap">
    <LoadingState v-if="dashboard.status === 'loading'"/>
    <SetupState v-else-if="dashboard.status === 'setup'"/>
    <ErrorState v-else-if="dashboard.status === 'error'"/>
    <EmptyState v-else-if="dashboard.status === 'empty'"/>

    <template v-else>
      <PartialResultsBanner/>
      <SummaryCards/>

      <section class="grid-main">
        <ActivityTimeline/>
        <aside class="rail-col">
          <SourcesPanel/>
          <!-- A one-day range renders a single full-width bar that just
               repeats the count above it. -->
          <DailyActivityChart v-if="dashboard.showsDailyChart"/>
          <FeatureCarousel/>
        </aside>
      </section>
    </template>
  </main>

  <BottomDock v-if="showsDashboard"/>

  <SettingsDrawer v-if="ui.isSettingsOpen"/>
  <StandupModal v-if="ui.isStandupOpen"/>

  <!-- Native scrollbars are hidden globally so they take no layout width;
       this draws the page one over the content instead. -->
  <OverlayScrollbar/>
</template>
