import {defineStore} from 'pinia';
import {computed, ref, shallowRef} from 'vue';

import {container} from '@/composition';
import type {DiagnosticCheck} from '@/application/ports/DiagnosticsGateway';
import {AppSettings} from '@/domain/settings/AppSettings';
import {type CredentialsForm, EMPTY_FORM} from '@/domain/settings/CredentialsDraft';
import {ApiError} from '@/infrastructure/http/json';

export const useSettingsStore = defineStore('settings', () => {
	const settings = shallowRef<AppSettings>(AppSettings.unknown());
	const form = ref<CredentialsForm>({...EMPTY_FORM, repos: []});
	const isSaving = ref(false);
	const saveError = ref('');
	const diagnostics = ref<readonly DiagnosticCheck[]>([]);
	const isDiagnosing = ref(false);

	/** Server-resolved preview of `form.storePath`, refreshed as the user types.
	 *  Home-collapsed: it is only ever displayed. */
	const resolvedStorePath = ref('');
	const storePathError = ref('');

	const isDemo = computed(() => settings.value.isDemo);
	const needsSetup = computed(() => settings.value.needsSetup);
	const connectedCount = computed(() => settings.value.connectedCount);

	async function load(): Promise<void> {
		settings.value = await container.settings.load();
	}

	/**
	 * Fill the form from the server's view.
	 *
	 * Token inputs are left blank on purpose — the server never sends values
	 * back, so there is nothing truthful to put in them. The placeholder says
	 * whether one is already set.
	 */
	function openForm(): void {
		const current = settings.value;
		form.value = {
			gitlabBaseUrl: current.gitlab.baseUrl,
			gitlabToken: '',
			jiraBaseUrl: current.jira.baseUrl,
			jiraEmail: current.jira.email,
			jiraToken: '',
			confluenceToken: '',
			repos: current.repos.length ? [...current.repos] : [''],
			gitAuthor: current.gitAuthor,
			// Pre-ticked once something is already saved, so re-saving does not
			// silently demote persisted credentials back to session-only.
			remember: current.isRemembered,
			// Blank means "the default"; only show a value the user actually chose.
			storePath: current.isStoreAtDefaultLocation ? '' : current.storePathDisplay,
		};
		resolvedStorePath.value = current.storePathDisplay;
		storePathError.value = '';
		saveError.value = '';
	}

	/**
	 * Resolving is a server call because only the server knows the home
	 * directory, whether the path names a directory, and whether it is writable.
	 */
	async function previewStorePath(): Promise<void> {
		const result = await container.settings.resolvePath(form.value.storePath);
		if (result.ok) {
			resolvedStorePath.value = result.display;
			storePathError.value = '';
		} else {
			resolvedStorePath.value = '';
			storePathError.value = result.error ?? 'Invalid path';
		}
	}

	function useDefaultStorePath(): void {
		form.value.storePath = '';
		void previewStorePath();
	}

	function addRepo(): void {
		form.value.repos.push('');
	}

	function removeRepo(index: number): void {
		form.value.repos.splice(index, 1);
	}

	/** Resolves false when the server rejected the save, so the drawer stays open. */
	async function save(): Promise<boolean> {
		isSaving.value = true;
		saveError.value = '';
		try {
			settings.value = await container.saveCredentials.execute(form.value);
			storePathError.value = '';
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Could not save settings';
			// A rejected path belongs beside the path input, not in a general banner.
			if (error instanceof ApiError && error.field === 'storePath') storePathError.value = message;
			else saveError.value = message;
			return false;
		} finally {
			isSaving.value = false;
		}
	}

	async function clearCredentials(): Promise<void> {
		settings.value = await container.clearCredentials.execute();
		// Wipe the in-memory form too, so the drawer does not still show URLs
		// that the server has just forgotten.
		form.value = {...EMPTY_FORM, repos: ['']};
		diagnostics.value = [];
	}

	const isRemembered = computed(() => settings.value.isRemembered);
	const storePathLocked = computed(() => settings.value.storePathLocked);
	/** Placeholder for the path field: the default, with no account name in it. */
	const storePathPlaceholder = computed(() => settings.value.storePathDefaultDisplay);
	/** What the hint should show: the live preview, falling back to what is in use. */
	const effectiveStorePath = computed(
		() => resolvedStorePath.value || settings.value.storePathDisplay,
	);

	async function runDiagnostics(): Promise<void> {
		isDiagnosing.value = true;
		try {
			diagnostics.value = await container.diagnostics.run();
		} finally {
			isDiagnosing.value = false;
		}
	}

	return {
		settings,
		form,
		isSaving,
		saveError,
		diagnostics,
		isDiagnosing,
		storePathError,

		isDemo,
		needsSetup,
		connectedCount,
		isRemembered,
		storePathLocked,
		storePathPlaceholder,
		effectiveStorePath,

		load,
		openForm,
		addRepo,
		removeRepo,
		save,
		clearCredentials,
		runDiagnostics,
		previewStorePath,
		useDefaultStorePath,
	};
});
