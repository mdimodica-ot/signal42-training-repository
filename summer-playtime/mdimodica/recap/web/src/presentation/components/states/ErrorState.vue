<script lang="ts" setup>
import {computed} from 'vue';

import {SOURCE_LIST} from '@/domain/activity/SourceKey';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import {useUiStore} from '@/presentation/stores/useUiStore';
import SourceIcon from '../ui/SourceIcon.vue';

const dashboard = useDashboardStore();
const ui = useUiStore();

const summary = computed(() => {
  const failed = dashboard.health.failed.length;
  const total = dashboard.health.all.length;
  const notConfigured = dashboard.health.all.filter((s) => s.notConfigured).length;
  const tail = notConfigured
      ? ` ${notConfigured} more ${notConfigured === 1 ? 'is' : 'are'} not configured yet.`
      : '';
  return `${failed} of ${total} sources failed. Nothing is cached, so the timeline stays empty until the fetch succeeds.${tail}`;
});

function statusOf(key: (typeof SOURCE_LIST)[number]['key']) {
  return dashboard.health.find(key);
}

function statusText(key: (typeof SOURCE_LIST)[number]['key']): string {
  const status = statusOf(key);
  if (!status) return '—';
  return status.ok ? `${status.count} events` : status.statusText;
}

function statusColour(key: (typeof SOURCE_LIST)[number]['key']): string {
  const status = statusOf(key);
  if (status?.ok) return 'var(--rc-success)';
  return status?.failed ? 'var(--rc-danger)' : 'var(--rc-text-faint)';
}
</script>

<template>
  <section>
    <div
        class="panel"
        style="border-color: rgba(255, 75, 106, 0.35); padding: 26px 30px; display: flex; gap: 18px; align-items: flex-start"
    >
      <div
          style="width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; background: rgba(255, 75, 106, 0.14); display: flex; align-items: center; justify-content: center"
      >
        <svg fill="none" height="17" stroke="var(--rc-danger)" stroke-width="1.8" viewBox="0 0 24 24" width="17">
          <path d="M12 4.5l8.5 15H3.5z"/>
          <path d="M12 10v4.2M12 16.6v.3"/>
        </svg>
      </div>

      <div style="flex: 1; min-width: 0">
        <span style="font-family: var(--rc-font-head); font-size: 15px; font-weight: 700">
          Couldn't fetch your activity
        </span>
        <p style="margin: 8px 0 0; font-size: 12px; line-height: 18px; color: var(--rc-text-muted)">
          {{ summary }}
        </p>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 18px">
          <div
              v-for="source in SOURCE_LIST"
              :key="source.key"
              :class="{ bad: statusOf(source.key)?.failed }"
              class="err-row"
          >
            <SourceIcon :source="source.key"/>
            <span style="font-size: 12px">{{ source.name }}</span>
            <div class="spacer"/>
            <span
                :style="{ fontSize: '10.5px', color: statusColour(source.key) }"
                :title="statusOf(source.key)?.error ?? undefined"
            >{{ statusText(source.key) }}</span>
          </div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button class="btn primary" @click="dashboard.load()">Retry fetch</button>
          <button class="btn" @click="ui.openSettings()">Check tokens</button>
        </div>
      </div>
    </div>
  </section>
</template>
