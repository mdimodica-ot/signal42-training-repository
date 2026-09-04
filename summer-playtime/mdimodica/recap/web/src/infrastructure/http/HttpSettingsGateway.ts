import type {ResolvePathResponse, SaveSettingsRequest} from '@shared/contracts';
import type {SettingsGateway} from '@/application/ports/SettingsGateway';
import {AppSettings, type AppSettingsDto} from '@/domain/settings/AppSettings';
import type {CredentialsPatch} from '@/domain/settings/CredentialsDraft';
import {getJson, sendJson} from './json';

/**
 * Talks to /api/config.
 *
 * Tokens travel in a POST body, never a query string: query strings end up in
 * access logs, browser history and shell history.
 */
export class HttpSettingsGateway implements SettingsGateway {
	async load(): Promise<AppSettings> {
		return AppSettings.fromApi(await getJson<AppSettingsDto>('/api/config'));
	}

	async save(patch: CredentialsPatch, remember: boolean, storePath: string): Promise<AppSettings> {
		const request: SaveSettingsRequest = {values: patch, remember, storePath};
		return AppSettings.fromApi(await sendJson<AppSettingsDto>('/api/config', 'POST', request));
	}

	async resolvePath(input: string): Promise<ResolvePathResponse> {
		return sendJson<ResolvePathResponse>('/api/config/resolve-path', 'POST', {path: input});
	}

	async clear(): Promise<AppSettings> {
		return AppSettings.fromApi(await sendJson<AppSettingsDto>('/api/config', 'DELETE'));
	}
}
