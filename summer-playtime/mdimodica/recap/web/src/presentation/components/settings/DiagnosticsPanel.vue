<script lang="ts" setup>
import {SOURCES} from '@/domain/activity/SourceKey';
import {useSettingsStore} from '@/presentation/stores/useSettingsStore';
import SourceIcon from '../ui/SourceIcon.vue';

/**
 * Shows what each provider actually said.
 *
 * The dashboard reduces failures to "401 · token" so the per-source status fits
 * in a rail. That is unhelpful when the token IS the problem, because the same
 * code covers an expired token, a scoped token used against a classic
 * endpoint, and the wrong account email. The server probes one auth endpoint
 * per source and returns the provider's own message plus a specific remedy.
 */
const settings = useSettingsStore();

const STATE_LABEL = {
  ok: 'authenticated',
  failed: 'failed',
  skipped: 'not configured',
} as const;
</script>

<template>
  <div class="settings-section">
    <div style="display: flex; align-items: center; gap: 12px">
      <span class="rail-kicker">Connection check</span>
      <div class="spacer"/>
      <button :disabled="settings.isDiagnosing" class="btn sm" @click="settings.runDiagnostics()">
        {{ settings.isDiagnosing ? 'Checking…' : 'Test connections' }}
      </button>
    </div>

    <p v-if="!settings.diagnostics.length" class="settings-note">
      Makes one authenticated request per configured source and reports exactly what came back.
      Nothing is written, and no activity is fetched.
    </p>

    <div v-else class="diag">
      <div
          v-for="check in settings.diagnostics"
          :key="check.source"
          :class="check.state"
          class="diag-row"
      >
        <div class="diag-head">
          <SourceIcon :source="check.source"/>
          <span class="diag-name">{{ SOURCES[check.source].name }}</span>
          <div class="spacer"/>
          <span :class="check.state" class="diag-state">
            {{ check.status ? `${check.status} · ` : '' }}{{ STATE_LABEL[check.state] }}
          </span>
        </div>

        <span v-if="check.detail" class="diag-detail">{{ check.detail }}</span>

        <!-- Verbatim, because the provider is often more specific than any
             wording we could invent. -->
        <div v-if="check.providerMessage" class="diag-provider">{{ check.providerMessage }}</div>

        <ul v-if="check.remedies.length" class="diag-remedies">
          <li v-for="(remedy, index) in check.remedies" :key="index">{{ remedy }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>
