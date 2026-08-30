<script lang="ts" setup>
import {computed} from 'vue';

import type {SourceKey} from '@/domain/activity/SourceKey';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import {useSettingsStore} from '@/presentation/stores/useSettingsStore';
import {useUiStore} from '@/presentation/stores/useUiStore';
import SourceIcon from '../ui/SourceIcon.vue';

const dashboard = useDashboardStore();
const settings = useSettingsStore();
const ui = useUiStore();

interface SetupEntry {
  key: SourceKey;
  title: string;
  hint: string;
  cta: string;
}

const entries: SetupEntry[] = [
  {key: 'git', title: 'Git repositories', hint: 'Point Recap at your local clones', cta: 'Add paths'},
  {key: 'gitlab', title: 'GitLab', hint: 'Personal access token, read_api scope', cta: 'Add token'},
  {key: 'jira', title: 'Jira', hint: 'API token and account email', cta: 'Add token'},
  {key: 'confluence', title: 'Confluence', hint: 'Optional — tracks page edits', cta: 'Add token'},
];

const connectedCount = computed(() => settings.connectedCount);
const canSync = computed(() => connectedCount.value > 0);

function isConnected(key: SourceKey): boolean {
  return settings.settings.isConnected(key);
}
</script>

<template>
  <section style="display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start">
    <div class="panel" style="padding: 34px 36px">
      <span class="badge" style="background: rgba(47, 102, 241, 0.9); color: #fff">Setup</span>
      <div style="font-family: var(--rc-font-head); font-size: 18px; font-weight: 700; margin-top: 16px">
        Connect your sources
      </div>
      <p style="margin: 10px 0 26px; max-width: 520px; font-size: 12px; line-height: 18px; color: var(--rc-text-muted)">
        Recap needs read access to the tools you work in. Tokens stay on this machine and are used
        only to fetch the current timeframe.
      </p>

      <div style="display: flex; flex-direction: column; gap: 10px; max-width: 560px">
        <div v-for="entry in entries" :key="entry.key" class="setup-row">
          <SourceIcon :size="17" :source="entry.key"/>
          <div class="setup-text">
            <span class="setup-title">{{ entry.title }}</span>
            <span :class="{ connected: isConnected(entry.key) }" class="setup-sub">
              {{ isConnected(entry.key) ? 'Connected' : entry.hint }}
            </span>
          </div>
          <div class="spacer"/>
          <button class="btn sm" style="height: 32px" @click="ui.openSettings()">
            {{ isConnected(entry.key) ? 'Edit' : entry.cta }}
          </button>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 14px; margin-top: 28px">
        <button
            :disabled="!canSync"
            class="btn primary"
            style="height: 40px; padding: 0 20px; font-size: 14px"
            @click="dashboard.load()"
        >
          Run first sync
        </button>
        <span style="font-size: 11px; color: var(--rc-text-faint)">
          {{ connectedCount }} of {{ settings.settings.totalSources }} sources connected
        </span>
      </div>
    </div>

    <div class="promo" style="padding: 24px 26px">
      <div style="font-family: var(--rc-font-head); font-size: 14px; font-weight: 700; color: #fff">
        What Recap does
      </div>
      <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 16px">
        <span style="font-size: 12px; line-height: 17px; color: #c9d6ea">
          Pulls commits, merge requests, tickets and doc edits into one chronological feed.
        </span>
        <span style="font-size: 12px; line-height: 17px; color: #c9d6ea">
          Turns the selected timeframe into a Markdown standup you can paste into Slack.
        </span>
        <span style="font-size: 12px; line-height: 17px; color: #c9d6ea">
          Stores nothing: data is fetched per session and dropped when you close the app.
        </span>
      </div>
    </div>
  </section>
</template>
