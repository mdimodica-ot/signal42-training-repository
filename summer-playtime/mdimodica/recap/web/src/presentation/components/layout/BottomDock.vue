<script lang="ts" setup>
import {computed} from 'vue';

import {SOURCES} from '@/domain/activity/SourceKey';
import {Timeframe} from '@/domain/time/Timeframe';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import {useUiStore} from '@/presentation/stores/useUiStore';

const dashboard = useDashboardStore();
const ui = useUiStore();

const scope = computed(() => {
  const count = dashboard.visibleEvents.length;
  const what = dashboard.isFiltered
      ? dashboard.activeFilters.map((key) => SOURCES[key].short).join(' + ')
      : Timeframe.describe(dashboard.timeframe);
  return `${count} event${count === 1 ? '' : 's'} · ${what}`;
});
</script>

<template>
  <div class="dock">
    <span class="dock-scope">{{ scope }}</span>
    <span class="dock-div"/>
    <button class="btn-copy" @click="ui.openStandup()">
      <svg fill="none" height="15" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24" width="15">
        <rect height="11" rx="2" width="11" x="9" y="9"/>
        <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15"/>
      </svg>
      Copy for Standup
    </button>
  </div>
</template>
