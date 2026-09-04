import type {ActivityGateway} from './application/ports/ActivityGateway';
import type {DiagnosticsGateway} from './application/ports/DiagnosticsGateway';
import type {PreferenceStore} from './application/ports/PreferenceStore';
import type {SettingsGateway} from './application/ports/SettingsGateway';
import {LoadActivity} from './application/usecases/LoadActivity';
import {ClearCredentials, SaveCredentials} from './application/usecases/ManageCredentials';
import {HttpActivityGateway} from './infrastructure/http/HttpActivityGateway';
import {HttpDiagnosticsGateway} from './infrastructure/http/HttpDiagnosticsGateway';
import {HttpSettingsGateway} from './infrastructure/http/HttpSettingsGateway';
import {LocalStoragePreferenceStore} from './infrastructure/storage/LocalStoragePreferenceStore';

/**
 * Composition root.
 *
 * The only place in the app that names a concrete implementation. Everything
 * downstream receives interfaces, which is what makes the domain and
 * application layers testable without a browser or a server.
 */
export interface Container {
	readonly loadActivity: LoadActivity;
	readonly saveCredentials: SaveCredentials;
	readonly clearCredentials: ClearCredentials;
	readonly settings: SettingsGateway;
	readonly diagnostics: DiagnosticsGateway;
	readonly preferences: PreferenceStore;
}

export function createContainer(
	overrides: Partial<{
		activity: ActivityGateway;
		settings: SettingsGateway;
		diagnostics: DiagnosticsGateway;
		preferences: PreferenceStore;
	}> = {},
): Container {
	const activity = overrides.activity ?? new HttpActivityGateway();
	const settings = overrides.settings ?? new HttpSettingsGateway();
	const diagnostics = overrides.diagnostics ?? new HttpDiagnosticsGateway();
	const preferences = overrides.preferences ?? new LocalStoragePreferenceStore();

	return {
		loadActivity: new LoadActivity(activity),
		saveCredentials: new SaveCredentials(settings),
		clearCredentials: new ClearCredentials(settings),
		settings,
		diagnostics,
		preferences,
	};
}

export const container = createContainer();
