import {ref} from 'vue';

type CopyState = 'idle' | 'copied' | 'manual';

/**
 * Copy text, with a fallback for when the Clipboard API is unavailable.
 *
 * `navigator.clipboard` requires a secure context. Recap is served over plain
 * HTTP on localhost — which browsers do treat as secure — but not when reached
 * from another machine on the LAN. There the write rejects, so the text is
 * selected instead and the user is told to press the shortcut.
 */
export function useClipboard(resetAfterMs = 2000) {
	const state = ref<CopyState>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy(text: string, fallbackTarget?: HTMLElement | null): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			state.value = 'copied';
		} catch {
			state.value = 'manual';
			if (fallbackTarget) selectContents(fallbackTarget);
		}

		clearTimeout(timer);
		timer = setTimeout(() => {
			state.value = 'idle';
		}, resetAfterMs);
	}

	return {state, copy};
}

function selectContents(element: HTMLElement): void {
	const range = document.createRange();
	range.selectNodeContents(element);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

/** Trigger a download without a server round trip. */
export function downloadText(text: string, fileName: string, mimeType = 'text/markdown'): void {
	const url = URL.createObjectURL(new Blob([text], {type: mimeType}));
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
}
