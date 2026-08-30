<script lang="ts" setup>
import {computed, onBeforeUnmount, ref} from 'vue';

import type {TokenOrigin} from '@shared/contracts';
import {useDashboardStore} from '@/presentation/stores/useDashboardStore';
import {useSettingsStore} from '@/presentation/stores/useSettingsStore';
import {useUiStore} from '@/presentation/stores/useUiStore';
import BaseOverlay from '../ui/BaseOverlay.vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import OverlayScrollbar from '../ui/OverlayScrollbar.vue';
import DiagnosticsPanel from './DiagnosticsPanel.vue';

const dashboard = useDashboardStore();
const settings = useSettingsStore();
const ui = useUiStore();

const isClearing = ref(false);
const drawerBody = ref<HTMLElement | null>(null);

/**
 * Tokens are never echoed back by the server, so the input starts blank and
 * the placeholder carries the only truthful thing we know: whether one is set,
 * and whether it came from `.env` or from this drawer.
 */
function tokenPlaceholder(hasToken: boolean, origin: TokenOrigin, emptyHint: string): string {
  if (!hasToken) return emptyHint;
  if (origin === 'env') return '•••••• (set in .env — type to override)';
  if (origin === 'stored') return '•••••• (saved on this machine — type to replace)';
  return '•••••• (set for this session — type to replace)';
}

const canClear = computed(() => settings.settings.hasClearableCredentials);

const clearBullets = computed(() => {
  const bullets = [
    'Removes the URLs, repository paths and tokens you entered in this drawer.',
    'Nothing is deleted from GitLab, Jira or Confluence — Recap only ever reads.',
  ];
  if (settings.isRemembered) {
    bullets.push(`Deletes the saved credential file at ${settings.effectiveStorePath}.`);
  }
  // Being explicit avoids the worst outcome: someone clicks Clear, assumes
  // every secret is gone, and it is not, because .env still has it.
  if (settings.settings.hasEnvBackedCredentials) {
    bullets.push(
        'Your .env file is NOT touched. Tokens stored there stay in place and will be used again on the next request — edit the file yourself to remove them.',
    );
  }
  return bullets;
});

/**
 * Debounced because each keystroke is a server round trip — the browser cannot
 * expand `~` or test writability itself.
 */
let pathPreviewTimer: ReturnType<typeof setTimeout> | undefined;

function onStorePathInput(): void {
  clearTimeout(pathPreviewTimer);
  pathPreviewTimer = setTimeout(() => void settings.previewStorePath(), 250);
}

onBeforeUnmount(() => clearTimeout(pathPreviewTimer));

async function save(): Promise<void> {
  // A rejected path must keep the drawer open, with the message beside the
  // field that caused it.
  if (!(await settings.save())) return;

  ui.closeSettings();
  if (settings.needsSetup) dashboard.showSetup();
  else await dashboard.load();
}

async function confirmClear(): Promise<void> {
  isClearing.value = true;
  try {
    await settings.clearCredentials();
    ui.dismissClearConfirm();
    ui.closeSettings();
    // With nothing configured the dashboard has nothing to fetch; go back to
    // the setup screen rather than showing an error nobody caused.
    if (settings.needsSetup) dashboard.showSetup();
    else await dashboard.load();
  } finally {
    isClearing.value = false;
  }
}
</script>

<template>
  <BaseOverlay align="right" @dismiss="ui.closeSettings()">
    <div class="drawer">
      <div class="modal-head">
        <span class="panel-title">Settings</span>
        <div class="spacer"/>
        <button aria-label="Close" class="close-x" @click="ui.closeSettings()">✕</button>
      </div>

      <div ref="drawerBody" class="drawer-body">
        <div class="settings-section">
          <span class="rail-kicker">Tokens</span>

          <div class="field">
            <label for="s-gitlab-url">GitLab base URL</label>
            <input
                id="s-gitlab-url"
                v-model="settings.form.gitlabBaseUrl"
                placeholder="https://gitlab.example.com"
                type="text"
            >
          </div>

          <div class="field">
            <label for="s-gitlab-token">GitLab personal access token</label>
            <input
                id="s-gitlab-token"
                v-model="settings.form.gitlabToken"
                :placeholder="tokenPlaceholder(settings.settings.gitlab.hasToken, settings.settings.gitlab.tokenOrigin, 'glpat-…')"
                autocomplete="off"
                type="password"
            >
            <span class="hint">Scope: read_api</span>
          </div>

          <div class="field">
            <label for="s-jira-url">Jira base URL</label>
            <input
                id="s-jira-url"
                v-model="settings.form.jiraBaseUrl"
                placeholder="https://your-site.atlassian.net"
                type="text"
            >
            <span class="hint">Confluence is derived from this, with /wiki appended.</span>
          </div>

          <div class="field">
            <label for="s-jira-email">Atlassian account email</label>
            <input
                id="s-jira-email"
                v-model="settings.form.jiraEmail"
                autocomplete="off"
                placeholder="you@example.com"
                type="text"
            >
          </div>

          <div class="field">
            <label for="s-jira-token">Jira API token</label>
            <input
                id="s-jira-token"
                v-model="settings.form.jiraToken"
                :placeholder="tokenPlaceholder(settings.settings.jira.hasToken, settings.settings.jira.tokenOrigin, 'ATATT…')"
                autocomplete="off"
                type="password"
            >
            <span class="hint">
              Use a classic token (ATATT…). A scoped token (ATCTT…) is rejected with 401.
            </span>
          </div>

          <div class="field">
            <label for="s-conf-token">Confluence API token</label>
            <input
                id="s-conf-token"
                v-model="settings.form.confluenceToken"
                :placeholder="tokenPlaceholder(settings.settings.confluence.hasToken, settings.settings.confluence.tokenOrigin, 'leave blank to reuse the Jira token')"
                autocomplete="off"
                type="password"
            >
          </div>
        </div>

        <div class="settings-section">
          <div style="display: flex; align-items: center; gap: 12px">
            <span class="rail-kicker">Local repositories</span>
            <div class="spacer"/>
            <button
                class="btn sm"
                style="border-style: dashed; color: var(--rc-blue-soft)"
                @click="settings.addRepo()"
            >
              ＋ Add repository
            </button>
          </div>

          <div class="field">
            <label for="s-git-author">Git author</label>
            <input
                id="s-git-author"
                v-model="settings.form.gitAuthor"
                autocomplete="email"
                placeholder="you@example.com"
                type="text"
            >
            <span class="hint">
              Optional when every repository has <code>git config user.email</code>.
            </span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px">
            <div v-for="(_, index) in settings.form.repos" :key="index" class="repo-row">
              <input
                  v-model="settings.form.repos[index]"
                  :aria-label="`Repository path ${index + 1}`"
                  placeholder="/home/you/Projects/my-repo"
                  type="text"
              >
              <button
                  :aria-label="`Remove repository ${index + 1}`"
                  class="repo-remove"
                  title="Remove this repository"
                  @click="settings.removeRepo(index)"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <DiagnosticsPanel/>

        <div class="settings-section">
          <span class="rail-kicker">Stored credentials</span>

          <label class="check-row">
            <input v-model="settings.form.remember" class="check" type="checkbox">
            <span class="check-text">
              <span class="check-title">Remember on this machine</span>
              <span class="check-hint">
                Saves these values so they survive a restart, in a file readable only by your
                user account. Never stored in the browser.
              </span>
            </span>
          </label>

          <!-- Only relevant once something is actually being written. -->
          <div v-if="settings.form.remember" class="field">
            <label for="s-store-path">Credential file location</label>
            <input
                id="s-store-path"
                v-model="settings.form.storePath"
                :disabled="settings.storePathLocked"
                :placeholder="settings.storePathPlaceholder"
                autocomplete="off"
                spellcheck="false"
                type="text"
                @input="onStorePathInput"
            >

            <span v-if="settings.storePathLocked" class="hint warn">
              Pinned by RECAP_CREDENTIALS_PATH in the environment.
            </span>
            <span v-else-if="settings.storePathError" class="hint err">
              {{ settings.storePathError }}
            </span>
            <span v-else class="hint">
              Saves to <code>{{ settings.effectiveStorePath }}</code>
            </span>

            <div v-if="!settings.storePathLocked" class="path-actions">
              <span class="hint">A folder or a full file path. <code>~</code> is expanded.</span>
              <div class="spacer"/>
              <button
                  :disabled="!settings.form.storePath"
                  class="btn sm"
                  @click="settings.useDefaultStorePath()"
              >
                Use default
              </button>
            </div>
          </div>

          <p class="settings-note">
            Left unticked, values are held in the server's memory and are lost when Recap stops.
            Either way they are never written to <code>.env</code>, which stays yours to edit.
          </p>

          <p v-if="settings.saveError" class="settings-note err">{{ settings.saveError }}</p>

          <button
              :disabled="!canClear"
              :title="canClear ? undefined : 'Nothing is stored yet'"
              class="btn danger"
              style="align-self: flex-start"
              @click="ui.askToClearCredentials()"
          >
            Clear stored tokens
          </button>
        </div>
      </div>

      <div class="drawer-foot">
        <button class="btn" style="flex: 1; height: 40px; font-size: 13.5px" @click="ui.closeSettings()">
          Cancel
        </button>
        <button
            :disabled="settings.isSaving"
            class="btn primary"
            style="flex: 1; height: 40px; font-size: 13.5px"
            @click="save"
        >
          {{ settings.isSaving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </div>
  </BaseOverlay>

  <OverlayScrollbar :target="drawerBody"/>

  <ConfirmDialog
      v-if="ui.isClearConfirmOpen"
      :bullets="clearBullets"
      :busy="isClearing"
      confirm-label="Clear tokens"
      message="Recap will forget every credential you entered in this session. You will need to paste them again to fetch activity."
      title="Clear stored tokens?"
      @cancel="ui.dismissClearConfirm()"
      @confirm="confirmClear"
  />
</template>
