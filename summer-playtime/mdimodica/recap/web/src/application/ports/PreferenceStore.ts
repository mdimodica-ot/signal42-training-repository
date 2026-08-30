import type {PresetId} from '@/domain/time/Timeframe';

/**
 * The only thing Recap remembers between visits.
 *
 * Tokens are deliberately NOT here. They live in server memory for the
 * session and in `.env` for the long term; writing them to localStorage would
 * put secrets at rest in the browser profile to buy nothing — a page reload
 * already keeps them, because the server process is what holds them.
 */
export interface Preferences {
	readonly preset?: PresetId;
}

export interface PreferenceStore {
	read(): Preferences;

	write(patch: Preferences): void;
}
