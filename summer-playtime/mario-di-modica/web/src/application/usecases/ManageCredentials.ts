import type {SettingsGateway} from '../ports/SettingsGateway';
import type {AppSettings} from '@/domain/settings/AppSettings';
import {CredentialsDraft, type CredentialsForm} from '@/domain/settings/CredentialsDraft';

export class SaveCredentials {
	constructor(private readonly gateway: SettingsGateway) {
	}

	async execute(form: CredentialsForm): Promise<AppSettings> {
		return this.gateway.save(new CredentialsDraft(form).toPatch(), form.remember, form.storePath);
	}
}

/**
 * Forget every credential Recap is holding: the current session AND the
 * credential file it wrote.
 *
 * Scope worth being precise about: it cannot and must not touch `.env`, which
 * the user authored. The confirmation dialog says so when `.env` is in play.
 */
export class ClearCredentials {
	constructor(private readonly gateway: SettingsGateway) {
	}

	async execute(): Promise<AppSettings> {
		return this.gateway.clear();
	}
}
