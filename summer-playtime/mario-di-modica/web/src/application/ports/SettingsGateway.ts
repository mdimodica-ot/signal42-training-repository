import type {AppSettings} from '@/domain/settings/AppSettings';
import type {CredentialsPatch} from '@/domain/settings/CredentialsDraft';

import type {ResolvePathResponse} from '@shared/contracts';

export interface SettingsGateway {
	load(): Promise<AppSettings>;

	/** `remember` persists to the machine's credential file instead of memory. */
	save(patch: CredentialsPatch, remember: boolean, storePath: string): Promise<AppSettings>;

	/** Drops every credential Recap holds: this session and the saved file. */
	clear(): Promise<AppSettings>;

	/**
	 * Ask the server where a typed path would land. Only the server knows the
	 * home directory, whether the path is a directory, and whether it is
	 * writable — so resolution cannot happen in the browser.
	 */
	resolvePath(input: string): Promise<ResolvePathResponse>;
}
