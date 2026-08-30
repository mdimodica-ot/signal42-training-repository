<script lang="ts" setup>
import {computed} from 'vue';

import {type SourceKey, SOURCES} from '@/domain/activity/SourceKey';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import SourceIcon from '../ui/SourceIcon.vue';

const dashboard = useDashboardStore();

interface NotePart {
  text: string;
  tone: 'add' | 'del' | null;
}

interface CardModel {
  source: SourceKey;
  value: number;
  label: string;
  sub: string;
  noteParts: NotePart[];
}

const cards = computed<CardModel[]>(() => {
  const s = dashboard.summary;
  return [
    {
      source: 'git',
      value: s.commits,
      label: 'Total Commits',
      sub: `across ${s.repos} ${s.repos === 1 ? 'repository' : 'repositories'}`,
      // Additions green, deletions red — the same pairing the timeline rows
      // already use, so the two never disagree about what red means.
      noteParts:
          s.linesAdded || s.linesRemoved
              ? [
                {text: `+${s.linesAdded}`, tone: 'add'},
                {text: ' / ', tone: null},
                {text: `−${s.linesRemoved}`, tone: 'del'},
              ]
              : [],
    },
    {
      source: 'gitlab',
      value: s.mrsMerged + s.mrsOpen,
      label: 'Merge Requests',
      sub: `${s.mrsMerged} merged, ${s.mrsOpen} open`,
      noteParts: s.mrsOpen ? [{text: `${s.mrsOpen} open`, tone: null}] : [],
    },
    {
      source: 'jira',
      value: s.ticketsTouched,
      label: 'Jira Tickets',
      sub: `${s.ticketsResolved} resolved`,
      noteParts: [],
    },
    {
      source: 'confluence',
      value: s.docsCreated + s.docsEdited,
      label: 'Docs Updated',
      // Created and edited stay visibly separate: Confluence's `contributor`
      // filter matches pages you only touched, and merging the two would
      // overstate authorship.
      sub: `${s.docsCreated} created, ${s.docsEdited} edited`,
      noteParts: [],
    },
  ];
});

function statusOf(source: SourceKey) {
  return dashboard.health.find(source);
}

function isFailed(source: SourceKey): boolean {
  return statusOf(source)?.failed ?? false;
}

function isNotConfigured(source: SourceKey): boolean {
  return statusOf(source)?.notConfigured ?? false;
}

function isUnavailable(source: SourceKey): boolean {
  return isFailed(source) || isNotConfigured(source);
}
</script>

<template>
  <section class="cards">
    <button
        v-for="card in cards"
        :key="card.source"
        :aria-pressed="dashboard.feed.isFilterActive(card.source)"
        :data-src="card.source"
        :disabled="isUnavailable(card.source)"
        class="card"
        @click="dashboard.toggleSourceFilter(card.source)"
    >
      <div class="card-top">
        <div
            :style="{
            background: isFailed(card.source)
              ? 'rgba(255,75,106,0.12)'
              : SOURCES[card.source].tint,
          }"
            class="card-icon"
        >
          <SourceIcon :dimmed="isUnavailable(card.source)" :size="17" :source="card.source"/>
        </div>

        <span
            :style="isFailed(card.source) ? { color: 'var(--rc-danger)' } : undefined"
            class="card-note"
        >
          <template v-if="isFailed(card.source)">{{ statusOf(card.source)?.statusText }}</template>
          <template v-else-if="isNotConfigured(card.source)">not set up</template>
          <template v-else>
            <span
                v-for="(part, index) in card.noteParts"
                :key="index"
                :class="part.tone ?? undefined"
            >{{ part.text }}</span>
          </template>
        </span>
      </div>

      <div class="card-body">
        <span
            :style="isUnavailable(card.source) ? { color: '#3B4C68' } : undefined"
            class="card-value"
        >
          {{ isUnavailable(card.source) ? '—' : card.value }}
        </span>
        <span class="card-label">{{ card.label }}</span>
        <span class="card-sub">
          <template v-if="isFailed(card.source)">
            {{ statusOf(card.source)?.error?.slice(0, 60) ?? 'failed' }}
          </template>
          <template v-else-if="isNotConfigured(card.source)">add a token in Settings</template>
          <template v-else>{{ card.sub }}</template>
        </span>
      </div>
    </button>
  </section>
</template>
