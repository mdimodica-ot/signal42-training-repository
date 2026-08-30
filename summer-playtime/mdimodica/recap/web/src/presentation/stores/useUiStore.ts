import {defineStore} from 'pinia';
import {ref} from 'vue';

/**
 * Which overlays are open.
 *
 * Kept in a store rather than in App.vue because the Settings drawer is
 * opened from five unrelated places — the header, the sources rail, the error
 * screen, the setup screen and the empty screen. Threading callbacks down to
 * all of them would couple components that otherwise share nothing.
 */
export const useUiStore = defineStore('ui', () => {
	const isSettingsOpen = ref(false);
	const isStandupOpen = ref(false);
	const isClearConfirmOpen = ref(false);

	function openSettings(): void {
		isSettingsOpen.value = true;
	}

	function closeSettings(): void {
		isSettingsOpen.value = false;
		isClearConfirmOpen.value = false;
	}

	function openStandup(): void {
		isStandupOpen.value = true;
	}

	function closeStandup(): void {
		isStandupOpen.value = false;
	}

	function askToClearCredentials(): void {
		isClearConfirmOpen.value = true;
	}

	function dismissClearConfirm(): void {
		isClearConfirmOpen.value = false;
	}

	/** Escape closes the topmost overlay only. */
	function closeTopmost(): void {
		if (isClearConfirmOpen.value) isClearConfirmOpen.value = false;
		else if (isStandupOpen.value) isStandupOpen.value = false;
		else if (isSettingsOpen.value) isSettingsOpen.value = false;
	}

	return {
		isSettingsOpen,
		isStandupOpen,
		isClearConfirmOpen,
		openSettings,
		closeSettings,
		openStandup,
		closeStandup,
		askToClearCredentials,
		dismissClearConfirm,
		closeTopmost,
	};
});
