<script lang="ts" setup>
import {computed} from 'vue';
import {useSettingsStore} from '@/presentation/stores/useSettingsStore';

const settings = useSettingsStore();

const label = computed(() =>
    settings.isDemo
        ? 'fetching from demo fixtures…'
        : `fetching from ${settings.connectedCount} source${settings.connectedCount === 1 ? '' : 's'}…`,
);

const CARD_WIDTHS = ['56%', '40%', '46%', '34%'];
const SUB_WIDTHS = ['72%', '64%', '58%', '68%'];
const ROWS = [0, 1, 2, 3, 4];
</script>

<template>
  <section>
    <div class="cards">
      <div
          v-for="(width, index) in CARD_WIDTHS"
          :key="index"
          class="panel"
          style="padding: 18px 20px 16px; display: flex; flex-direction: column; gap: 18px"
      >
        <div class="shimmer" style="width: 30px; height: 30px"/>
        <div :style="{ width, height: '30px' }" class="shimmer"/>
        <div :style="{ width: SUB_WIDTHS[index], height: '10px' }" class="shimmer"/>
      </div>
    </div>

    <div class="panel" style="margin-top: 24px">
      <div class="panel-head">
        <span class="panel-title">Activity timeline</span>
        <span style="display: inline-flex; align-items: center; gap: 8px; font-size: 11px; color: var(--rc-blue-soft)">
          <span class="spinner"/>
          <span>{{ label }}</span>
        </span>
      </div>

      <div style="padding: 10px 10px 18px">
        <div v-for="row in ROWS" :key="row" class="loading-row">
          <div class="shimmer" style="width: 28px; height: 28px; border-radius: 8px; flex: 0 0 28px"/>
          <div class="lines">
            <div class="shimmer" style="width: 62%; height: 12px"/>
            <div class="shimmer" style="width: 34%; height: 10px"/>
          </div>
          <div class="shimmer" style="width: 44px; height: 10px"/>
        </div>
      </div>
    </div>
  </section>
</template>
