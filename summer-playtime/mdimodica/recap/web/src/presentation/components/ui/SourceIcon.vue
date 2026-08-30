<script lang="ts" setup>
import {computed} from 'vue';
import {type SourceKey, SOURCES} from '@/domain/activity/SourceKey';

const props = withDefaults(
    defineProps<{
      source: SourceKey;
      size?: number;
      dimmed?: boolean;
    }>(),
    {size: 15, dimmed: false},
);

const descriptor = computed(() => SOURCES[props.source]);
</script>

<template>
  <img
      :alt="descriptor.name"
      :src="descriptor.iconUrl"
      :style="{
      width: `${size}px`,
      height: `${size}px`,
      objectFit: 'contain',
      opacity: dimmed ? 0.5 : 1,
    }"
  >
</template>
