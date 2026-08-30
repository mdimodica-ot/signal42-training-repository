<script lang="ts" setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref} from 'vue';

import {LocalDay} from '@/domain/time/LocalDay';
import {PRESET_LABELS, type PresetId, PRESETS, Timeframe} from '@/domain/time/Timeframe';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import {useAnchoredPopover} from '@/presentation/composables/useAnchoredPopover';
import RangeCalendar from './RangeCalendar.vue';

const dashboard = useDashboardStore();

const isOpen = ref(false);
const anchor = ref<HTMLElement | null>(null);
const popover = ref<HTMLElement | null>(null);
const {position, reposition} = useAnchoredPopover(anchor, popover, isOpen);

const draftStart = ref<LocalDay | null>(null);
const draftEnd = ref<LocalDay | null>(null);
const error = ref('');

const isCustomActive = computed(() => dashboard.timeframe.kind === 'custom');

function isActive(preset: PresetId): boolean {
  return Timeframe.isPreset(dashboard.timeframe, preset);
}

async function togglePopover(): Promise<void> {
  isOpen.value = !isOpen.value;
  if (!isOpen.value) return;

  const current = dashboard.timeframe;
  draftStart.value = current.kind === 'custom' ? current.range.from : null;
  draftEnd.value = current.kind === 'custom' ? current.range.to : null;
  error.value = '';

  // Measure after the popover exists, or its width reads as zero and the
  // clamp puts it in the wrong place on the first open.
  await nextTick();
  reposition();
}

/**
 * First click sets the start and clears the end; the second closes the range.
 * Clicking before the current start restarts from there, which is what people
 * expect from a range picker instead of an "invalid range" complaint.
 */
function pick(day: LocalDay): void {
  error.value = '';
  if (!draftStart.value || draftEnd.value) {
    draftStart.value = day;
    draftEnd.value = null;
  } else if (day.isBefore(draftStart.value)) {
    draftStart.value = day;
  } else {
    draftEnd.value = day;
  }
}

function apply(): void {
  const start = draftStart.value;
  if (!start) {
    error.value = 'Pick a start date.';
    return;
  }
  // One tapped day is a legitimate single-day range; close it implicitly
  // rather than making the user click the same cell twice.
  void dashboard.selectRange(start, draftEnd.value ?? start);
  isOpen.value = false;
}

function selectPreset(preset: PresetId): void {
  void dashboard.selectPreset(preset);
}

function onDocumentClick(event: MouseEvent): void {
  if (!isOpen.value) return;
  const target = event.target as Node;
  if (anchor.value?.contains(target) || popover.value?.contains(target)) return;
  isOpen.value = false;
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
  <div class="tfgroup">
    <button
        v-for="preset in PRESETS"
        :key="preset"
        :aria-pressed="isActive(preset)"
        class="tf"
        @click="selectPreset(preset)"
    >
      {{ PRESET_LABELS[preset] }}
    </button>

    <button
        ref="anchor"
        :aria-pressed="isCustomActive"
        class="tf"
        style="display: inline-flex; align-items: center; gap: 6px; font-weight: 400"
        @click.stop="togglePopover"
    >
      <svg fill="none" height="12" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24" width="12">
        <rect height="16" rx="2" width="18" x="3" y="5"/>
        <path d="M8 3v4M16 3v4M3 11h18"/>
      </svg>
      Custom Range
    </button>
  </div>

  <!-- Teleported to body: the header clips overflow, which would slice the
       calendar in half if it stayed a descendant. -->
  <Teleport to="body">
    <div
        v-if="isOpen"
        ref="popover"
        :style="{ left: `${position.left}px`, top: `${position.top}px` }"
        class="custom-pop"
        @click.stop
    >
      <RangeCalendar :end="draftEnd" :start="draftStart" @pick="pick"/>
      <div v-if="error" class="custom-pop-err">{{ error }}</div>
      <div style="display: flex; gap: 8px; margin-top: 2px">
        <button class="btn sm" style="flex: 1" @click="isOpen = false">Cancel</button>
        <button class="btn sm primary" style="flex: 1" @click="apply">Apply</button>
      </div>
    </div>
  </Teleport>
</template>
