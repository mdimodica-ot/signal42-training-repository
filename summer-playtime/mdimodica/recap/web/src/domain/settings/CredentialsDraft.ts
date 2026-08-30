/** What the Settings form holds while the user is editing it. */
export interface CredentialsForm {
	gitlabBaseUrl: string;
	gitlabToken: string;
	jiraBaseUrl: string;
	jiraEmail: string;
	jiraToken: string;
	confluenceToken: string;
	repos: string[];
	gitAuthor: string;
	/** Save to the machine's credential file rather than for this session only. */
	remember: boolean;
	/** Where that file lives. Blank means the platform default. */
	storePath: string;
}

import type {CredentialsPatch} from '@shared/contracts';

export type {CredentialsPatch};

export const EMPTY_FORM: CredentialsForm = {
	gitlabBaseUrl: '',
	gitlabToken: '',
	jiraBaseUrl: '',
	jiraEmail: '',
	jiraToken: '',
	confluenceToken: '',
	repos: [],
	gitAuthor: '',
	remember: false,
	storePath: '',
};

/**
 * Converts the Settings form into a patch for the server.
 *
 * The rule that matters: a BLANK token field means "leave it alone", not
 * "delete it". Token inputs start empty because the server never sends values
 * back, so submitting them as empty strings would wipe whatever is in `.env`
 * every time anyone opened Settings and pressed Save.
 *
 * URLs and repo paths behave the opposite way — they are shown pre-filled, so
 * clearing one is a deliberate instruction and is sent through.
 */
export class CredentialsDraft {
	constructor(private readonly form: CredentialsForm) {
	}

	toPatch(): CredentialsPatch {
		const patch: CredentialsPatch = {
			GITLAB_BASE_URL: this.form.gitlabBaseUrl.trim(),
			JIRA_BASE_URL: this.form.jiraBaseUrl.trim(),
			JIRA_EMAIL: this.form.jiraEmail.trim(),
			CONFLUENCE_BASE_URL: confluenceUrlFor(this.form.jiraBaseUrl),
			RECAP_GIT_REPOS: this.form.repos.map((r) => r.trim()).filter(Boolean).join(','),
			RECAP_GIT_AUTHOR: this.form.gitAuthor.trim(),
		};

		// Only send secrets the user actually typed.
		if (this.form.gitlabToken.trim()) patch.GITLAB_TOKEN = this.form.gitlabToken.trim();
		if (this.form.jiraToken.trim()) patch.JIRA_API_TOKEN = this.form.jiraToken.trim();
		if (this.form.confluenceToken.trim()) patch.CONFLUENCE_API_TOKEN = this.form.confluenceToken.trim();

		return patch;
	}

}

/**
 * Confluence lives under /wiki on the same Atlassian site as Jira. Deriving it
 * saves a field that is wrong far more often than it is different — a missing
 * /wiki prefix is the most common cause of a 404 from Confluence.
 */
function confluenceUrlFor(jiraBaseUrl: string): string {
	const base = jiraBaseUrl.trim().replace(/\/+$/, '');
	if (!base) return '';
	return base.endsWith('/wiki') ? base : `${base}/wiki`;
}
