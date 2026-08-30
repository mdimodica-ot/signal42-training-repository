<script lang="ts" setup>
import {onBeforeUnmount, onMounted, ref} from 'vue';

/**
 * Previews of features that are designed but not built. Both actions stay
 * disabled — a button that silently does nothing is worse than one that says
 * it is not ready.
 */
interface Slide {
  id: string;
  title: string;
  body: string;
  /** Emphasised fragment rendered in white inside the body copy. */
  emphasis?: string;
}

const slides: Slide[] = [
  {
    id: 'retro',
    title: 'Retro summary',
    body: 'Group the week into themes — shipped, blocked, carried over — ready to paste into your retro board.',
  },
  {
    id: 'review',
    title: 'Review planner',
    body: 'Take every task sitting in Done on the board and group it by discipline — Frontend, Backend, Full stack and Bugs — so review time is split by area instead of read ticket by ticket.',
    emphasis: 'Done',
  },
];

const track = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

/** Scroll position is the single source of truth, so a trackpad swipe and the
 *  arrow buttons can never disagree about which slide is showing. */
function syncFromScroll(): void {
  const element = track.value;
  if (!element || element.clientWidth === 0) return;
  activeIndex.value = Math.round(element.scrollLeft / element.clientWidth);
}

function goTo(index: number): void {
  const element = track.value;
  if (!element) return;
  const clamped = Math.max(0, Math.min(slides.length - 1, index));
  element.scrollTo({left: clamped * element.clientWidth, behavior: 'smooth'});
}

onMounted(() => {
  track.value?.addEventListener('scroll', syncFromScroll, {passive: true});
  window.addEventListener('resize', syncFromScroll);
});

onBeforeUnmount(() => {
  track.value?.removeEventListener('scroll', syncFromScroll);
  window.removeEventListener('resize', syncFromScroll);
});

/** Splits the body so the emphasised word can be bolded without v-html. */
function bodyParts(slide: Slide): [string, string, string] {
  if (!slide.emphasis) return [slide.body, '', ''];
  const at = slide.body.indexOf(slide.emphasis);
  if (at === -1) return [slide.body, '', ''];
  return [
    slide.body.slice(0, at),
    slide.emphasis,
    slide.body.slice(at + slide.emphasis.length),
  ];
}
</script>

<template>
  <div class="carousel">
    <div ref="track" class="carousel-track">
      <div v-for="slide in slides" :key="slide.id" class="promo carousel-slide">
        <div style="display: flex; align-items: center; gap: 8px">
          <!-- Same sparkle mark on every preview: they are one family of
               upcoming features, and a different glyph per card read as a
               different kind of thing. -->
          <span class="promo-spark">
            <svg aria-hidden="true" fill="#fff" height="12" viewBox="0 0 24 24" width="12">
              <path d="M12 3l1.5 4.4L18 9l-4.5 1.6L12 15l-1.5-4.4L6 9l4.5-1.6z"/>
              <path d="M18.2 14.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>
            </svg>
          </span>
          <span class="badge" style="background: rgba(155, 129, 241, 0.85); color: #fff">
            Coming soon
          </span>
        </div>

        <h3>{{ slide.title }}</h3>
        <p>
          <template v-for="(part, index) in bodyParts(slide)" :key="index">
            <strong v-if="index === 1 && part">{{ part }}</strong>
            <template v-else>{{ part }}</template>
          </template>
        </p>

        <button class="btn promo-btn" disabled title="Not available yet">Generate</button>
      </div>
    </div>

    <div class="carousel-nav">
      <button aria-label="Previous" class="carousel-arrow" @click="goTo(activeIndex - 1)">‹</button>
      <div class="carousel-dots">
        <button
            v-for="(slide, index) in slides"
            :key="slide.id"
            :aria-label="`Show ${slide.title}`"
            :class="{ active: index === activeIndex }"
            class="carousel-dot"
            @click="goTo(index)"
        />
      </div>
      <button aria-label="Next" class="carousel-arrow" @click="goTo(activeIndex + 1)">›</button>
    </div>
  </div>
</template>
