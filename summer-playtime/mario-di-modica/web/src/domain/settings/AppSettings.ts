import type {AppSettingsDto, SourceKey, TokenOrigin} from '@shared/contracts';
import {SOURCE_KEYS} from '@shared/contracts';

export type {AppSettingsDto, TokenOrigin};

/**
 * The server's view of what is configured.
 *
 * Deliberately contains no token VALUES — the server answers with `hasToken`
 * booleans only. Nothing in the client can leak a secret it never receives.
 */
export class AppSettings {
	private constructor(private readonly dto: AppSettingsDto) {
	}

	/** True when the process was started with --demo. Not a user preference. */
	get isDemo(): boolean {
		return this.dto.demo;
	}

	get connectedCount(): number {
		return this.dto.connectedCount;
	}

	get totalSources(): number {
		return SOURCE_KEYS.length;
	}

	/** Nothing configured and not in demo — the setup screen, not an error. */
	get needsSetup(): boolean {
		return !this.dto.demo && this.dto.connectedCount === 0;
	}

	/** Whether "Clear tokens" has anything to remove. */
	get hasClearableCredentials(): boolean {
		return this.dto.clearable;
	}

	/** Some secret comes from `.env`, which the app must not claim to delete. */
	get hasEnvBackedCredentials(): boolean {
		return this.dto.envBacked;
	}

	/** Credentials are saved to disk by Recap and will survive a restart. */
	get isRemembered(): boolean {
		return this.dto.remembered;
	}

	/**
	 * Home-collapsed location of the credential file, and the platform default.
	 * The absolute forms stay on the server — see AppSettingsDto.
	 */
	get storePathDisplay(): string {
		return this.dto.storePathDisplay;
	}

	get storePathDefaultDisplay(): string {
		return this.dto.storePathDefaultDisplay;
	}

	/** True when the file is wherever Recap would put it by default. */
	get isStoreAtDefaultLocation(): boolean {
		return this.dto.storePathDisplay === this.dto.storePathDefaultDisplay;
	}

	/** Pinned by RECAP_CREDENTIALS_PATH — the UI must not offer to move it. */
	get storePathLocked(): boolean {
		return this.dto.storePathLocked;
	}

	get repos(): readonly string[] {
		return this.dto.git.repos;
	}

	get gitlab() {
		return this.dto.gitlab;
	}

	get jira() {
		return this.dto.jira;
	}

	get confluence() {
		return this.dto.confluence;
	}

	static fromApi(dto: AppSettingsDto): AppSettings {
		return new AppSettings(dto);
	}

	/** Before the first response: assume nothing is set up. */
	static unknown(): AppSettings {
		return new AppSettings({
			demo: false,
			connected: {git: false, gitlab: false, jira: false, confluence: false},
			connectedCount: 0,
			clearable: false,
			envBacked: false,
			remembered: false,
			storePathDisplay: '',
			storePathDefaultDisplay: '',
			storePathLocked: false,
			git: {repos: [], author: ''},
			gitlab: {baseUrl: '', hasToken: false, tokenOrigin: 'none', enrich: false},
			jira: {baseUrl: '', email: '', hasToken: false, tokenOrigin: 'none'},
			confluence: {baseUrl: '', email: '', hasToken: false, tokenOrigin: 'none'},
		});
	}

	isConnected(source: SourceKey): boolean {
		return this.dto.connected[source];
	}
}
