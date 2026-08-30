<script lang="ts" setup>
import {ref, toRef} from 'vue';
import {useOverlayScrollbar} from '@/presentation/composables/useOverlayScrollbar';

/**
 * A scrollbar drawn over the content rather than beside it.
 *
 * Native scrollbars are hidden globally (see main.css) because a styled one
 * still reserves a gutter and narrows the layout. This replaces them: it takes
 * no layout space, appears while scrolling or hovering, and fades out when
 * idle.
 *
 * Pass `target` to attach it to a scroll container; omit it for the page.
 */
const props = withDefaults(defineProps<{ target?: HTMLElement | null }>(), {target: null});

const targetRef = props.target === undefined ? ref(null) : toRef(props, 'target');
const {geometry, isVisible, isDragging, startDrag} = useOverlayScrollbar(targetRef);
</script>

<template>
  <Teleport to="body">
    <div
        v-show="isVisible"
        :class="{ dragging: isDragging }"
        :style="{
        top: `${geometry.thumbTop}px`,
        left: `${geometry.right - 10}px`,
        height: `${geometry.thumbHeight}px`,
      }"
        class="oscroll"
        role="presentation"
        @pointerdown="startDrag"
    />
  </Teleport>
</template>
