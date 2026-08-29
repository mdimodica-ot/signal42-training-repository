import type {DiagnosticCheck, SourceKey} from '../../shared/contracts.js';
import {type AppConfig, type AtlassianConfig, basicAuth, type GitLabConfig} from '../config.js';

/**
 * Credential diagnostics.
 *
 * The activity endpoint deliberately reduces every failure to a short code so
 * the dashboard can render a compact per-source status. That is the right call
 * for the timeline and the wrong one for debugging: `401 · token` is true of an
 * expired token, a scoped token used against a classic endpoint, a mistyped
 * email, and an account password pasted where an API token belongs.
 *
 * This module makes exactly one authenticated call per configured source and
 * reports the raw status, a slice of the provider's own message, and a
 * specific remedy. Nothing here is used by the timeline; it exists so a failing
 * setup can be fixed without reading server logs.
 */

const TIMEOUT_MS = 10_000;

interface Probe {
	status: number;
	body: string;
	ok: boolean;
	network?: string;
}

export async function diagnose(config: AppConfig): Promise<DiagnosticCheck[]> {
	return Promise.all([
		checkGitLab(config.gitlab),
		checkAtlassian('jira', config.jira, '/rest/api/3/myself'),
		checkAtlassian('confluence', config.confluence, '/rest/api/user/current'),
	]);
}

async function probe(url: string, headers: Record<string, string>): Promise<Probe> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			headers: {Accept: 'application/json', ...headers},
			signal: controller.signal,
			redirect: 'manual',
		});
		const body = (await response.text().catch(() => '')).slice(0, 400);
		return {status: response.status, body, ok: response.ok};
	} catch (error) {
		const isTimeout = error instanceof Error && error.name === 'AbortError';
		const cause = (error as { cause?: { code?: string } }).cause?.code;
		return {
			status: 0,
			body: '',
			ok: false,
			network: isTimeout ? 'timeout' : (cause ?? (error instanceof Error ? error.message : 'failed')),
		};
	} finally {
		clearTimeout(timer);
	}
}

/* ------------------------------------------------------------------ GitLab */

async function checkGitLab({baseUrl, token}: GitLabConfig): Promise<DiagnosticCheck> {
	if (!baseUrl || !token) return skipped('gitlab');

	const result = await probe(`${baseUrl}/api/v4/user`, {'PRIVATE-TOKEN': token});
	if (result.network) return unreachable('gitlab', result, baseUrl);

	if (result.ok) {
		const username = safeJson<{ username?: string }>(result.body)?.username;
		return passed('gitlab', username ? `authenticated as ${username}` : 'authenticated');
	}

	if (result.status === 401) {
		return failed('gitlab', result, 'Token rejected.', [
			'The token is expired, revoked, or was copied with a missing character.',
			'GitLab personal access tokens expire — check the expiry date on the token page.',
			'Create a new token with the `read_api` scope and paste it again.',
		]);
	}

	if (result.status === 403) {
		return failed('gitlab', result, 'Token authenticated but is not allowed to read the API.', [
			'The token is missing the `read_api` scope. `read_user` alone is not enough.',
			'Regenerate it with `read_api` ticked.',
		]);
	}

	if (result.status === 404) {
		return failed('gitlab', result, 'No GitLab API at that URL.', [
			'GITLAB_BASE_URL must be the instance root, with no /api/v4 suffix — e.g. https://gitlab.example.com',
			`Currently set to: ${baseUrl}`,
		]);
	}

	return failed('gitlab', result, `Unexpected ${result.status}.`, []);
}

/* --------------------------------------------------------------- Atlassian */

async function checkAtlassian(
	key: SourceKey,
	{baseUrl, email, token}: AtlassianConfig,
	probePath: string,
): Promise<DiagnosticCheck> {
	if (!baseUrl || !email || !token) return skipped(key);

	const result = await probe(`${baseUrl}${probePath}`, {Authorization: basicAuth(email, token)});
	if (result.network) return unreachable(key, result, baseUrl);

	if (result.ok) {
		const who = safeJson<{ displayName?: string }>(result.body)?.displayName;
		return passed(key, who ? `authenticated as ${who}` : 'authenticated');
	}

	const remedies: string[] = [];
	const body = result.body.toLowerCase();

	if (result.status === 401) {
		// Atlassian ships two kinds of API token and they are not interchangeable.
		// Classic tokens (ATATT…) work with Basic auth against your site URL.
		// Scoped tokens (ATCTT…) are OAuth-style: they only work against
		// api.atlassian.com/ex/jira/{cloudId} and always 401 on the site URL.
		if (token.startsWith('ATCTT')) {
			remedies.push(
				'This is a SCOPED API token (it starts with ATCTT). Scoped tokens do not work with Basic auth against your site URL — they always answer 401 there.',
				'Create a CLASSIC token instead: https://id.atlassian.com/manage-profile/security/api-tokens → "Create API token" (NOT "Create API token with scopes"). A classic token starts with ATATT.',
			);
		} else if (body.includes('password')) {
			remedies.push(
				'Atlassian says a password was used. Basic auth with an account password is disabled on Atlassian Cloud.',
				'Use an API token from https://id.atlassian.com/manage-profile/security/api-tokens, not your login password.',
			);
		} else {
			remedies.push(
				`Check the email is the Atlassian ACCOUNT email, exactly as shown at https://id.atlassian.com/manage-profile/profile-and-visibility — an alias or group address will 401. Currently sending: ${email}`,
				'Check the token has not been revoked or expired at https://id.atlassian.com/manage-profile/security/api-tokens',
				'Make sure the token was created by the same account as the email above — a token from a different account 401s.',
				'Re-copy the token: it is only shown once, and a truncated paste looks identical to a wrong one.',
			);
			if (!token.startsWith('ATATT')) {
				remedies.push(
					'This token does not start with ATATT, which is what a classic Atlassian Cloud API token looks like. Confirm you copied a Cloud API token and not something else.',
				);
			}
		}
	} else if (result.status === 403) {
		remedies.push(
			'The credentials are valid but the account is not allowed here.',
			body.includes('captcha')
				? 'Atlassian has triggered a CAPTCHA after repeated failed logins. Sign in to the site in a browser, clear the CAPTCHA, then retry.'
				: `The account may lack a ${key === 'jira' ? 'Jira' : 'Confluence'} product licence, or the site restricts API access by IP.`,
		);
	} else if (result.status === 404) {
		remedies.push(
			key === 'confluence'
				? `CONFLUENCE_BASE_URL must include the /wiki prefix — e.g. https://your-site.atlassian.net/wiki (currently: ${baseUrl})`
				: `JIRA_BASE_URL must be the site root with no trailing path — e.g. https://your-site.atlassian.net (currently: ${baseUrl})`,
		);
	} else if (result.status === 429) {
		remedies.push('Rate limited by Atlassian. Wait a minute and retry.');
	}

	return failed(key, result, `${result.status} from ${baseUrl}${probePath}`, remedies);
}

/* ----------------------------------------------------------------- shapes */

function skipped(source: SourceKey): DiagnosticCheck {
	return {source, state: 'skipped', detail: 'Not configured', remedies: []};
}

function passed(source: SourceKey, detail: string): DiagnosticCheck {
	return {source, state: 'ok', status: 200, detail, remedies: []};
}

function failed(
	source: SourceKey,
	result: Probe,
	detail: string,
	remedies: string[],
): DiagnosticCheck {
	return {
		source,
		state: 'failed',
		status: result.status,
		detail,
		// The provider's own words, trimmed. Often the fastest route to the cause.
		providerMessage: extractMessage(result.body),
		remedies,
	};
}

function unreachable(source: SourceKey, result: Probe, baseUrl: string): DiagnosticCheck {
	return {
		source,
		state: 'failed',
		status: 0,
		detail:
			result.network === 'timeout'
				? `No answer from ${baseUrl} within ${TIMEOUT_MS}ms.`
				: `Cannot reach ${baseUrl} (${result.network}).`,
		remedies: [
			'Check the URL is right and that you are on the network or VPN that can see it.',
			'A self-hosted instance behind a corporate VPN will fail exactly like this when the VPN is down.',
		],
	};
}

function safeJson<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

function extractMessage(body: string): string {
	const parsed = safeJson<Record<string, unknown>>(body);
	if (parsed) {
		const candidate =
			parsed.message ??
			parsed.error_description ??
			parsed.error ??
			(Array.isArray(parsed.errorMessages) ? parsed.errorMessages[0] : undefined);
		if (typeof candidate === 'string' && candidate) return candidate.slice(0, 200);
	}
	const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	return text ? text.slice(0, 200) : '';
}
