<script lang="ts" setup>
import BaseOverlay from './BaseOverlay.vue';

withDefaults(
    defineProps<{
      title: string;
      message: string;
      /** Points the action cannot undo, or explicitly will not touch. */
      bullets?: readonly string[];
      confirmLabel?: string;
      cancelLabel?: string;
      busy?: boolean;
    }>(),
    {bullets: () => [], confirmLabel: 'Confirm', cancelLabel: 'Cancel', busy: false},
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <BaseOverlay @dismiss="emit('cancel')">
    <div aria-modal="true" class="confirm" role="alertdialog">
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>

      <ul v-if="bullets.length">
        <li v-for="(bullet, index) in bullets" :key="index">{{ bullet }}</li>
      </ul>

      <div class="confirm-actions">
        <button :disabled="busy" class="btn" @click="emit('cancel')">{{ cancelLabel }}</button>
        <button :disabled="busy" class="btn danger" @click="emit('confirm')">
          {{ busy ? 'Working…' : confirmLabel }}
        </button>
      </div>
    </div>
  </BaseOverlay>
</template>
