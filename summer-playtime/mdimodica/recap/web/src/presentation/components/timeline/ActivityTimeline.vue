<script lang="ts" setup>
import {computed} from 'vue';

import {SOURCE_LIST, SOURCES} from '@/domain/activity/SourceKey';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import TimelineRow from './TimelineRow.vue';

const dashboard = useDashboardStore();

const eventsLabel = computed(() => {
  const count = dashboard.visibleEvents.length;
  return `${count} event${count === 1 ? '' : 's'}${dashboard.isFiltered ? ' · filtered' : ''}`;
});

const filterLabel = computed(
    () => `filtered: ${dashboard.activeFilters.map((key) => SOURCES[key].short).join(' + ')} ✕`,
);

/** A source that failed has no trustworthy count, so it shows a dash. */
function legendCount(key: (typeof SOURCE_LIST)[number]['key']): string {
  const status = dashboard.health.find(key);
  return status?.ok ? String(dashboard.feed.countBySource(key)) : '—';
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <span class="panel-title">Activity timeline</span>
      <span class="panel-meta">{{ eventsLabel }}</span>

      <button v-if="dashboard.isFiltered" class="filter-pill" @click="dashboard.clearSourceFilter()">
        {{ filterLabel }}
      </button>

      <div class="spacer"/>

      <div class="legend">
        <span v-for="source in SOURCE_LIST" :key="source.key" :class="source.key" class="chip">
          <span class="dot"/>
          {{ source.short }} {{ legendCount(source.key) }}
        </span>
      </div>
    </div>

    <div class="timeline">
      <div v-if="!dashboard.visibleEvents.length" class="center-state" style="padding: 48px 20px 34px">
        <span style="font-family: var(--rc-font-head); font-size: 13px; font-weight: 700">
          No activity to show
        </span>
        <p>No events from the selected sources in this timeframe.</p>
        <button class="btn" @click="dashboard.clearSourceFilter()">Clear filter</button>
      </div>

      <template v-for="(group, groupIndex) in dashboard.dayGroups" :key="group.day.toISO()">
        <div :class="{ sep: groupIndex > 0 }" class="day-head">
          <span class="day-name">{{ group.heading }}</span>
          <span class="day-meta">{{ group.subheading }}</span>
        </div>

        <TimelineRow
            v-for="(event, index) in group.events"
            :key="event.id"
            :event="event"
            :is-last="index === group.events.length - 1"
        />
      </template>
    </div>
  </div>
</template>
