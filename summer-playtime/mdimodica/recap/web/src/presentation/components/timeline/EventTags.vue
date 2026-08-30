<script lang="ts" setup>
import {computed} from 'vue';
import type {ActivityEvent} from '@/domain/activity/ActivityEvent';

const props = defineProps<{ event: ActivityEvent }>();

const meta = computed(() => props.event.meta);

/** "repo · branch", skipping whichever half is missing. */
const commitLocation = computed(() =>
    [props.event.project, meta.value.branch].filter(Boolean).join(' · '),
);

const ticketDetail = computed(() =>
    [meta.value.issueType, meta.value.priority].filter(Boolean).join(' · ').toLowerCase(),
);

const pageDetail = computed(() =>
    [
      meta.value.space ? `space: ${meta.value.space}` : null,
      meta.value.version ? `v${meta.value.version}` : null,
    ]
        .filter(Boolean)
        .join(' · '),
);

/** A page you edited but did not write — worth saying plainly. */
const showsForeignAuthor = computed(
    () =>
        props.event.action === 'edited' &&
        Boolean(meta.value.pageAuthor) &&
        !meta.value.authoredByMe,
);
</script>

<template>
  <div class="row-tags">
    <template v-if="event.kind === 'commit'">
      <span v-if="meta.sha" class="sha">{{ meta.sha }}</span>
      <span class="mono">{{ commitLocation }}</span>
      <span v-if="meta.insertions != null" class="add">+{{ meta.insertions }}</span>
      <span v-if="meta.deletions != null" class="del">−{{ meta.deletions }}</span>
    </template>

    <template v-else-if="event.kind === 'merge_request'">
      <span :class="event.badgeTone" class="badge">{{ event.action }}</span>
      <span v-if="meta.sourceBranch" class="mono">
        {{ meta.sourceBranch }} → {{ meta.targetBranch }}
      </span>
      <span v-if="meta.insertions != null" class="add">+{{ meta.insertions }}</span>
      <span v-if="meta.deletions != null" class="del">−{{ meta.deletions }}</span>
      <span v-if="meta.approvals" class="note">
        {{ meta.approvals }} approval{{ meta.approvals === 1 ? '' : 's' }}
      </span>
      <span v-if="meta.pipeline" class="note">pipeline {{ meta.pipeline }}</span>
    </template>

    <template v-else-if="event.kind === 'ticket'">
      <span v-if="meta.status" :class="event.badgeTone" class="badge">{{ meta.status }}</span>
      <span v-if="ticketDetail" class="mono">{{ ticketDetail }}</span>
    </template>

    <template v-else-if="event.kind === 'issue'">
      <span :class="event.badgeTone" class="badge">{{ event.action }}</span>
      <span v-if="meta.labels?.length" class="mono">
        {{ meta.labels.slice(0, 3).join(', ') }}
      </span>
    </template>

    <template v-else-if="event.kind === 'page'">
      <span v-if="pageDetail" class="mono">{{ pageDetail }}</span>
      <template v-if="showsForeignAuthor">
        <span class="sep-dot">·</span>
        <span class="note">page by {{ meta.pageAuthor }}</span>
      </template>
      <template v-if="meta.note">
        <span class="sep-dot">·</span>
        <span class="note">{{ meta.note }}</span>
      </template>
    </template>
  </div>
</template>
