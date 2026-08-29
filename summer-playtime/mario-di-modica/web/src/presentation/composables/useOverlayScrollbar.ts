import {computed, onBeforeUnmount, onMounted, ref, type Ref, watch} from 'vue';

/**
 * Geometry and visibility for a custom overlay scrollbar.
 *
 * WHY NOT `::-webkit-scrollbar`
 * ----------------------------
 * A styled native scrollbar still reserves a gutter in the layout: give it
 * `width: 10px` and the content box shrinks by 10px, which is exactly the
 * "affects the view width" problem. `overflow: overlay` used to avoid that and
 * is deprecated.
 *
 * So the native scrollbar is hidden outright (zero width, no gutter) and this
 * draws a thumb *over* the content instead. It is idle-hidden and fades in
 * while scrolling, hovering or dragging.
 *
 * `null` target means the page itself.
 */

const IDLE_HIDE_MS = 900;
const MIN_THUMB_PX = 28;

interface Geometry {
	/** Viewport coordinates of the scrollbar track. */
	top: number;
	right: number;
	height: number;
	thumbTop: number;
	thumbHeight: number;
}

const EMPTY: Geometry = {top: 0, right: 0, height: 0, thumbTop: 0, thumbHeight: 0};

export function useOverlayScrollbar(target: Ref<HTMLElement | null>) {
	const geometry = ref<Geometry>(EMPTY);
	const isScrollable = ref(false);
	const isActive = ref(false); // scrolling or hovering
	const isDragging = ref(false);

	const isVisible = computed(() => isScrollable.value && (isActive.value || isDragging.value));

	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let dragOffset = 0;

	/** The element that actually scrolls, and the one whose rect we measure. */
	function scroller(): HTMLElement {
		return target.value ?? document.documentElement;
	}

	function measure(): void {
		const el = scroller();
		const isPage = target.value === null;

		const viewportHeight = isPage ? window.innerHeight : el.clientHeight;
		const scrollHeight = el.scrollHeight;

		isScrollable.value = scrollHeight > viewportHeight + 1;
		if (!isScrollable.value) {
			geometry.value = EMPTY;
			return;
		}

		// Page scrollbar hugs the viewport; a container's hugs its own box.
		const rect = isPage
			? {top: 0, right: window.innerWidth, height: viewportHeight}
			: (() => {
				const r = el.getBoundingClientRect();
				return {top: r.top, right: r.right, height: r.height};
			})();

		const thumbHeight = Math.max(
			MIN_THUMB_PX,
			(viewportHeight / scrollHeight) * rect.height,
		);
		const maxScroll = scrollHeight - viewportHeight;
		const progress = maxScroll > 0 ? el.scrollTop / maxScroll : 0;

		geometry.value = {
			top: rect.top,
			right: rect.right,
			height: rect.height,
			thumbTop: rect.top + progress * (rect.height - thumbHeight),
			thumbHeight,
		};
	}

	function reveal(): void {
		isActive.value = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			isActive.value = false;
		}, IDLE_HIDE_MS);
	}

	function onScroll(): void {
		measure();
		reveal();
	}

	/* ------------------------------------------------------------- dragging */

	function startDrag(event: PointerEvent): void {
		event.preventDefault();
		isDragging.value = true;
		dragOffset = event.clientY - geometry.value.thumbTop;
		window.addEventListener('pointermove', onDrag);
		window.addEventListener('pointerup', endDrag, {once: true});
	}

	function onDrag(event: PointerEvent): void {
		const el = scroller();
		const {height, thumbHeight, top} = geometry.value;
		const travel = height - thumbHeight;
		if (travel <= 0) return;

		const viewportHeight = target.value === null ? window.innerHeight : el.clientHeight;
		const progress = Math.min(1, Math.max(0, (event.clientY - dragOffset - top) / travel));
		el.scrollTop = progress * (el.scrollHeight - viewportHeight);
	}

	function endDrag(): void {
		isDragging.value = false;
		window.removeEventListener('pointermove', onDrag);
	}

	/* ------------------------------------------------------------ lifecycle */

	let observer: ResizeObserver | undefined;

	function attach(el: HTMLElement | null): void {
		const scrollSource: EventTarget = el ?? window;
		scrollSource.addEventListener('scroll', onScroll, {passive: true});
		(el ?? document.body).addEventListener('pointerenter', reveal);

		// Content height changes as sources load; the thumb must resize with it.
		observer = new ResizeObserver(measure);
		observer.observe(el ?? document.body);

		measure();
	}

	function detach(el: HTMLElement | null): void {
		const scrollSource: EventTarget = el ?? window;
		scrollSource.removeEventListener('scroll', onScroll);
		(el ?? document.body).removeEventListener('pointerenter', reveal);
		observer?.disconnect();
		observer = undefined;
	}

	onMounted(() => {
		attach(target.value);
		window.addEventListener('resize', measure);
	});

	// The drawer and modal mount after the page does, so the target can arrive late.
	watch(target, (next, previous) => {
		detach(previous ?? null);
		attach(next);
	});

	onBeforeUnmount(() => {
		detach(target.value);
		window.removeEventListener('resize', measure);
		window.removeEventListener('pointermove', onDrag);
		clearTimeout(hideTimer);
	});

	return {geometry, isVisible, isDragging, startDrag, measure};
}
