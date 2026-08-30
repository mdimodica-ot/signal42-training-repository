import type {Preferences, PreferenceStore} from '@/application/ports/PreferenceStore';
import {isPresetId} from '@/domain/time/Timeframe';

const STORAGE_KEY = 'recap.preferences.v2';

/**
 * UI preferences only — see the PreferenceStore port for why no credentials
 * are kept here.
 *
 * Every access is guarded: localStorage throws in private mode and when a
 * profile has storage disabled, and losing a remembered tab is not worth
 * taking the whole dashboard down.
 */
export class LocalStoragePreferenceStore implements PreferenceStore {
	read(): Preferences {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) return {};
			const parsed: unknown = JSON.parse(raw);
			if (typeof parsed !== 'object' || parsed === null) return {};
			const preset = (parsed as { preset?: unknown }).preset;
			return isPresetId(preset) ? {preset} : {};
		} catch {
			return {};
		}
	}

	write(patch: Preferences): void {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify({...this.read(), ...patch}));
		} catch {
			/* preferences simply will not persist */
		}
	}
}
