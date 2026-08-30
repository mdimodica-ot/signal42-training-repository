<script lang="ts" setup>
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';

const dashboard = useDashboardStore();
</script>

<template>
  <section class="panel center-state">
    <div class="state-icon">
      <svg fill="none" height="20" stroke="var(--rc-text-faint)" stroke-width="1.6" viewBox="0 0 24 24" width="20">
        <rect height="16" rx="2" width="18" x="3" y="5"/>
        <path d="M8 3v4M16 3v4M3 11h18"/>
      </svg>
    </div>

    <span style="font-family: var(--rc-font-head),serif; font-size: 15px; font-weight: 700">
      No activity in this timeframe
    </span>

    <!-- Says explicitly that the sources ANSWERED. An empty timeline that
         might mean "broken integration" is the thing this state exists to
         rule out. -->
    <p>
      All configured sources answered, none of them had events in
      {{ dashboard.range.describe() }}. Try a wider timeframe.
    </p>

    <div style="display: flex; gap: 10px; margin-top: 6px">
      <button class="btn primary" @click="dashboard.selectPreset('7d')">
        Switch to Last 7 Days
      </button>
      <button class="btn" @click="dashboard.load()">Re-sync now</button>
    </div>
  </section>
</template>
