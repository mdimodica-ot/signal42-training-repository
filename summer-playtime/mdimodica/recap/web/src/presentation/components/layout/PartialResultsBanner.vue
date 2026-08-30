<script lang="ts" setup>
import {computed} from 'vue';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';

const dashboard = useDashboardStore();

/**
 * Names both halves: what failed AND what the numbers below are therefore
 * based on. A banner that only says "something failed" leaves the reader
 * unsure whether the totals can be trusted.
 */
const message = computed(() => {
  const failed = dashboard.health.failed.map((s) => s.label).join(' and ');
  const ok = dashboard.health.succeeded.map((s) => s.label).join(' and ');
  return `Partial results — ${failed} failed to answer. What you see below is ${ok || 'nothing'} only.`;
});
</script>

<template>
  <div v-if="dashboard.health.isPartial" class="banner">
    <svg fill="none" height="15" stroke="var(--rc-danger)" stroke-width="1.8" viewBox="0 0 24 24" width="15">
      <path d="M12 4.5l8.5 15H3.5z"/>
      <path d="M12 10v4.2M12 16.6v.3"/>
    </svg>
    <span>{{ message }}</span>
    <div class="spacer"/>
    <button
        class="btn primary"
        style="height: 30px; padding: 0 13px; font-size: 12px"
        @click="dashboard.load()"
    >
      Retry failed sources
    </button>
  </div>
</template>
