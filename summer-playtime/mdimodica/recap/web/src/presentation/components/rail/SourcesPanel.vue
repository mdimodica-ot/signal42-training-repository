<script lang="ts" setup>
import {computed} from 'vue';

import {SOURCE_LIST} from '@/domain/activity/SourceKey';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import {useUiStore} from '@/presentation/stores/useUiStore';

const dashboard = useDashboardStore();
const ui = useUiStore();

const pulseColour = computed(() =>
    dashboard.health.anyFailed ? 'var(--rc-danger)' : 'var(--rc-success)',
);

function statusFor(key: (typeof SOURCE_LIST)[number]['key']) {
  return dashboard.health.find(key);
}

function statusText(key: (typeof SOURCE_LIST)[number]['key']): string {
  // In demo every source is a fixture; reporting "12 · 0ms" would imply a
  // request that never happened.
  if (dashboard.isDemo) return 'demo fixtures';
  return statusFor(key)?.statusText ?? '—';
}
</script>

<template>
  <div class="panel panel-sm">
    <div class="rail-head">
      <span class="rail-kicker">Connected sources</span>
      <span :style="{ background: pulseColour }" class="pulse"/>
    </div>

    <div style="display: flex; flex-direction: column; gap: 12px">
      <div v-for="source in SOURCE_LIST" :key="source.key" class="src-row">
        <span :style="{ background: source.colourVar }" class="src-swatch"/>
        <span class="src-name">{{ source.name }}</span>
        <div class="spacer"/>
        <span
            :class="dashboard.isDemo ? 'ok' : statusFor(source.key)?.tone"
            :title="statusFor(source.key)?.error ?? undefined"
            class="src-status"
        >{{ statusText(source.key) }}</span>
      </div>
    </div>

    <button class="btn-wide" @click="ui.openSettings()">Manage tokens</button>
  </div>
</template>
