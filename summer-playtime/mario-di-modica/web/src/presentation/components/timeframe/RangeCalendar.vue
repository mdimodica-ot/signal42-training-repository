<script lang="ts" setup>
import {computed, ref} from 'vue';
import {LocalDay} from '@/domain/time/LocalDay';

/**
 * Monday-first month grid with range selection.
 *
 * Every date is a `LocalDay`, never a string or a `Date`. That is what keeps
 * clicking "10 Aug" from selecting 9 Aug — see LocalDay for the full story.
 */
const props = defineProps<{
  start: LocalDay | null;
  end: LocalDay | null;
}>();

const emit = defineEmits<{ pick: [day: LocalDay] }>();

const today = LocalDay.today();
const visibleMonth = ref<LocalDay>(startOfMonth(props.start ?? today));

interface Cell {
  day: LocalDay;
  label: string;
  outsideMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  isStart: boolean;
  isEnd: boolean;
  inRange: boolean;
}

// Always six rows, so the popover keeps a constant height while paging months.
const CELLS = 42;

const cells = computed<Cell[]>(() => {
  const first = visibleMonth.value;
  const offset = first.weekdayIndex;
  const {start, end} = props;

  return Array.from({length: CELLS}, (_, index) => {
    const day = first.addDays(index - offset);
    // A single tapped day is a valid one-day range, so the start cell is drawn
    // as both endpoints until an end is chosen.
    const isStart = start != null && day.equals(start);
    const isEnd = end != null ? day.equals(end) : isStart;

    return {
      day,
      label: String(day.day),
      outsideMonth: day.month !== first.month,
      isToday: day.equals(today),
      isFuture: day.isAfter(today),
      isStart,
      isEnd,
      inRange:
          start != null && end != null && day.isAfter(start) && day.isBefore(end),
    };
  });
});

const monthLabel = computed(() =>
    visibleMonth.value.format({month: 'long', year: 'numeric'}),
);

const readout = computed(() => {
  const {start, end} = props;
  if (start && end) {
    const days = start.daysUntil(end) + 1;
    return `${start.format()} → ${end.format()} · ${days} day${days === 1 ? '' : 's'}`;
  }
  if (start) return `${start.format()} → pick an end date`;
  return 'Pick a start date';
});

function startOfMonth(day: LocalDay): LocalDay {
  return day.addDays(1 - day.day);
}

function shiftMonth(delta: number): void {
  const current = visibleMonth.value;
  // Step via a mid-month day so a 31st never overflows into the next month.
  visibleMonth.value = startOfMonth(
      LocalDay.fromDate(new Date(current.year, current.month - 1 + delta, 1)),
  );
}
</script>

<template>
  <div class="cal-head">
    <button aria-label="Previous month" class="carousel-arrow" @click="shiftMonth(-1)">‹</button>
    <span class="cal-month">{{ monthLabel }}</span>
    <button aria-label="Next month" class="carousel-arrow" @click="shiftMonth(1)">›</button>
  </div>

  <div class="cal-dow">
    <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
  </div>

  <div class="cal-grid">
    <button
        v-for="cell in cells"
        :key="cell.day.toISO()"
        :aria-label="cell.day.format({ weekday: 'long', day: 'numeric', month: 'long' })"
        :class="{
        muted: cell.outsideMonth,
        today: cell.isToday,
        start: cell.isStart,
        end: cell.isEnd,
        'in-range': cell.inRange,
      }"
        :disabled="cell.isFuture"
        class="cal-day"
        @click="emit('pick', cell.day)"
    >
      {{ cell.label }}
    </button>
  </div>

  <div class="cal-readout">{{ readout }}</div>
</template>
