import {onBeforeUnmount, onMounted, ref, type Ref} from 'vue';

interface Position {
	left: number;
	top: number;
}

/**
 * Position a teleported popover under an anchor element.
 *
 * The popover is rendered at body level with `position: fixed`, not inside the
 * header, because the header sets `overflow: hidden` — an absolutely
 * positioned child gets clipped at the header's bottom edge and the calendar
 * appears as a sliver. Being outside the header means the coordinates have to
 * be computed here.
 */
export function useAnchoredPopover(
	anchor: Ref<HTMLElement | null>,
	popover: Ref<HTMLElement | null>,
	isOpen: Ref<boolean>,
) {
	const position = ref<Position>({left: 0, top: 0});

	function reposition(): void {
		const anchorEl = anchor.value;
		if (!anchorEl) return;
		const rect = anchorEl.getBoundingClientRect();
		const width = popover.value?.offsetWidth ?? 268;
		const GUTTER = 8;

		// Clamp so a button near the right edge does not push the popover
		// off-screen.
		const left = Math.min(Math.max(GUTTER, rect.left), window.innerWidth - width - GUTTER);
		position.value = {left, top: rect.bottom + GUTTER};
	}

	function onViewportChange(): void {
		if (isOpen.value) reposition();
	}

	onMounted(() => {
		window.addEventListener('resize', onViewportChange);
		window.addEventListener('scroll', onViewportChange, true);
	});

	onBeforeUnmount(() => {
		window.removeEventListener('resize', onViewportChange);
		window.removeEventListener('scroll', onViewportChange, true);
	});

	return {position, reposition};
}
