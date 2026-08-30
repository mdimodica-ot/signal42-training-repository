<script lang="ts" setup>
/**
 * Backdrop shared by the standup modal, the settings drawer and the confirm
 * dialog.
 *
 * Only a click that both starts and ends on the backdrop dismisses. Without
 * that check, selecting text inside the modal and releasing the mouse outside
 * it closes the dialog and throws away what the user was doing.
 */
import {ref} from 'vue';

withDefaults(defineProps<{ align?: 'center' | 'right' }>(), {align: 'center'});

const emit = defineEmits<{ dismiss: [] }>();

const pressedBackdrop = ref(false);

function onPointerDown(event: MouseEvent): void {
  pressedBackdrop.value = event.target === event.currentTarget;
}

function onClick(event: MouseEvent): void {
  if (pressedBackdrop.value && event.target === event.currentTarget) emit('dismiss');
  pressedBackdrop.value = false;
}
</script>

<template>
  <div
      :class="{ right: align === 'right' }"
      class="overlay"
      @click="onClick"
      @mousedown="onPointerDown"
  >
    <slot/>
  </div>
</template>
