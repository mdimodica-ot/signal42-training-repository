<script lang="ts" setup>
import type {ActivityEvent} from '@/domain/activity/ActivityEvent';
import SourceIcon from '../ui/SourceIcon.vue';
import EventTags from './EventTags.vue';

defineProps<{
  event: ActivityEvent;
  /** The connector line is omitted on the last row of a day group. */
  isLast: boolean;
}>();
</script>

<template>
  <div class="row">
    <div class="rail">
      <div :class="event.source" class="rail-icon">
        <SourceIcon :source="event.source"/>
      </div>
      <div v-if="!isLast" class="rail-line"/>
    </div>

    <div class="row-body">
      <div class="row-top">
        <a
            v-if="event.url"
            :class="{ doc: event.kind === 'page' }"
            :href="event.url"
            class="row-title"
            rel="noopener"
            target="_blank"
        >{{ event.title }}</a>
        <span v-else :class="{ doc: event.kind === 'page' }" class="row-title">
          {{ event.title }}
        </span>

        <div class="spacer"/>

        <!-- Day-precision sources report no clock time; showing 00:00 would be
             inventing data, so it renders as a dash with an explanation. -->
        <span
            :title="event.hasExactTime ? undefined : 'This source reports the date only, not the time'"
            class="row-time"
        >{{ event.displayTime }}</span>
      </div>

      <EventTags :event="event"/>
    </div>
  </div>
</template>
