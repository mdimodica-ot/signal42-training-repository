<script lang="ts" setup>
import {computed, ref} from 'vue';

import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import {useUiStore} from '@/presentation/stores/useUiStore';
import {downloadText, useClipboard} from '@/presentation/composables/useClipboard';
import BaseOverlay from '../ui/BaseOverlay.vue';
import OverlayScrollbar from '../ui/OverlayScrollbar.vue';

const dashboard = useDashboardStore();
const ui = useUiStore();

const markdownEl = ref<HTMLElement | null>(null);
const modalBody = ref<HTMLElement | null>(null);
const {state: copyState, copy} = useClipboard();

const copyLabel = computed(() => {
  if (copyState.value === 'copied') return 'Copied';
  if (copyState.value === 'manual') return 'Press ⌘/Ctrl+C';
  return 'Copy markdown';
});

function onCopy(): void {
  void copy(dashboard.standupMarkdown, markdownEl.value);
}

function onExport(): void {
  downloadText(dashboard.standupMarkdown, dashboard.standupFileName);
}
</script>

<template>
  <BaseOverlay @dismiss="ui.closeStandup()">
    <div class="modal">
      <div class="modal-head">
        <span class="panel-title">Standup summary</span>
        <span class="panel-meta">markdown · {{ dashboard.range.describe() }}</span>
        <div class="spacer"/>
        <button aria-label="Close" class="close-x" @click="ui.closeStandup()">✕</button>
      </div>

      <div ref="modalBody" class="modal-body">
        <pre ref="markdownEl">{{ dashboard.standupMarkdown }}</pre>
      </div>

      <div class="modal-foot">
        <span style="font-size: 11.5px; color: var(--rc-text-faint)">
          Formatted for Slack and Teams.
        </span>
        <div class="spacer"/>
        <button
            class="btn"
            style="height: 38px; font-size: 13.5px; display: inline-flex; align-items: center; gap: 8px"
            @click="onExport"
        >
          <svg fill="none" height="14" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24" width="14">
            <path d="M12 4v11M8 11.5l4 4 4-4M5 19.5h14"/>
          </svg>
          Export .md
        </button>
        <button class="btn" style="height: 38px; font-size: 13.5px" @click="ui.closeStandup()">
          Close
        </button>
        <button class="btn primary" style="height: 38px; font-size: 13.5px" @click="onCopy">
          {{ copyLabel }}
        </button>
      </div>
    </div>
  </BaseOverlay>

  <OverlayScrollbar :target="modalBody"/>
</template>
