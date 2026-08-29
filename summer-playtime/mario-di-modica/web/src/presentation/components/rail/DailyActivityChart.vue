<script lang="ts" setup>
import {computed} from 'vue';
import {LocalDay} from '@/domain/time/LocalDay';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';

const dashboard = useDashboardStore();

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const MAX_BAR_HEIGHT = 68;
const EMPTY_BAR_HEIGHT = 4;

const today = LocalDay.today();

const peak = computed(() => Math.max(1, ...dashboard.dailyCounts.map((d) => d.count)));

const bars = computed(() =>
    dashboard.dailyCounts.map(({day, count}) => ({
      key: day.toISO(),
      count,
      isToday: day.equals(today),
      initial: WEEKDAY_INITIALS[day.weekdayIndex],
      height:
          count === 0
              ? EMPTY_BAR_HEIGHT
              : Math.max(8, Math.round((count / peak.value) * MAX_BAR_HEIGHT)),
      // Faint bars for quiet days, solid for busy ones — the shape alone is hard
      // to read at this size.
      opacity: count === 0 ? 1 : 0.35 + 0.65 * (count / peak.value),
      title: `${day.format({
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      })} · ${count} event${count === 1 ? '' : 's'}`,
    })),
);
</script>

<template>
  <div class="panel panel-sm">
    <span class="rail-kicker">Activity by day</span>
    <div class="bars">
      <div v-for="bar in bars" :key="bar.key" :title="bar.title" class="bar-col">
        <span class="bar-n">{{ bar.count }}</span>
        <div
            :class="{ empty: bar.count === 0, today: bar.isToday }"
            :style="{ height: `${bar.height}px`, opacity: bar.opacity }"
            class="bar"
        />
        <span class="bar-d">{{ bar.initial }}</span>
      </div>
    </div>
  </div>
</template>
