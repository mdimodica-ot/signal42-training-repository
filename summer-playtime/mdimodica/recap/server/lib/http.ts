import type {FailureCode} from '../../shared/contracts.js';

/**
 * Small fetch wrapper shared by the HTTP adapters.
 *
 * Every adapter failure must surface as a *structured* error, because the UI
 * renders per-source failure states ("401 · token", "503 · timeout") rather
 * than one global error. So we always attach `status` and a short `code`.
 */

export class SourceError extends Error {
	readonly status: number;
	readonly code: FailureCode;

	constructor(message: string, options: { status?: number; code?: FailureCode } = {}) {
		super(message);
		this.name = 'SourceError';
		this.status = options.status ?? 0;
		this.code = options.code ?? 'error';
	}
}

const DEFAULT_TIMEOUT_MS = 15_000;

interface GetJsonOptions {
	headers?: Record<string, string>;
	timeout?: number;
	label?: string;
}

export async function getJson<T>(url: string, options: GetJsonOptions = {}): Promise<T> {
	const {headers = {}, timeout = DEFAULT_TIMEOUT_MS, label = 'source'} = options;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);

	let response: Response;
	try {
		response = await fetch(url, {
			headers: {Accept: 'application/json', ...headers},
			signal: controller.signal,
			// Credentials belong to the configured origin. Following a redirect
			// could forward them to a typoed or compromised destination.
			redirect: 'manual',
		});
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new SourceError(`${label} timed out after ${timeout}ms`, {status: 0, code: 'timeout'});
		}
		// DNS failure, refused connection, bad TLS, VPN down...
		const cause = (error as { cause?: { code?: string } }).cause?.code;
		const detail = cause ?? (error instanceof Error ? error.message : String(error));
		throw new SourceError(`${label} unreachable: ${detail}`, {status: 0, code: 'unreachable'});
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new SourceError(shortReason(response.status, body, label), {
			status: response.status,
			code: codeFor(response.status),
		});
	}

	return (await response.json()) as T;
}

function codeFor(status: number): FailureCode {
	if (status === 401) return 'token';
	if (status === 403) return 'forbidden';
	if (status === 404) return 'not-found';
	if (status === 429) return 'rate-limit';
	if (status >= 500) return 'timeout';
	return 'error';
}

function shortReason(status: number, body: string, label: string): string {
	const hint =
		status === 401
			? 'token rejected — check it has not expired'
			: status === 403
				? 'token lacks the required scope'
				: status === 404
					? 'endpoint not found — check the base URL'
					: status === 429
						? 'rate limited'
						: 'request failed';

	// Keep a sliver of the body: Jira/GitLab put useful messages there.
	const detail = body.slice(0, 180).replace(/\s+/g, ' ').trim();
	return `${label} ${status}: ${hint}${detail ? ` (${detail})` : ''}`;
}
