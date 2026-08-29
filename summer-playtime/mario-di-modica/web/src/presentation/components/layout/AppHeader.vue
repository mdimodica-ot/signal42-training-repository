<script lang="ts" setup>
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import {useSettingsStore} from '@/presentation/stores/useSettingsStore';
import {useUiStore} from '@/presentation/stores/useUiStore';
import TimeframeTabs from '../timeframe/TimeframeTabs.vue';

/**
 * `showFilters` is false during first-run setup. Timeframe tabs over an
 * unconfigured app are controls with nothing to control: pressing one starts a
 * fetch against zero sources and lands back on the same setup screen, which
 * reads as the button being broken.
 */
defineProps<{ showFilters: boolean }>();

const dashboard = useDashboardStore();
const settings = useSettingsStore();
const ui = useUiStore();
</script>

<template>
  <header class="topbar">
    <div style="display: flex; flex-direction: column; gap: 1px">
      <span class="brand-name">Recap</span>
      <span class="brand-tag">all your work, in one place</span>
    </div>

    <TimeframeTabs v-if="showFilters"/>
    <span v-if="showFilters" class="range-label">{{ dashboard.range.describe() }}</span>

    <div class="spacer"/>

    <!-- Demo is chosen at launch (`npm run start:demo`), so this states a fact
         rather than offering a switch. A live run never renders it. -->
    <span v-if="settings.isDemo" class="demo-badge"
          title="Started with --demo: all data is generated. No network calls are made.">
      <span class="dot"/>
      Demo data
    </span>

    <button aria-label="Settings" class="icon-btn" title="Settings" @click="ui.openSettings()">
      <svg fill="none" height="16" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24" width="16">
        <circle cx="12" cy="12" r="3.2"/>
        <path
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.8a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.2 8L4 7.9a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9.8 4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.3 1z"/>
      </svg>
    </button>
  </header>
</template>
