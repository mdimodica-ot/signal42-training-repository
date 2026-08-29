import type {SettingsError} from '@shared/contracts';

/**
 * The field names the server is allowed to blame, taken from the contract
 * rather than spelled out again here. Renaming the field in `contracts.ts` is
 * then a compile error at this line, instead of a comparison that quietly
 * stops matching and leaves the message on the wrong control.
 */
const ERROR_FIELDS: readonly NonNullable<SettingsError['field']>[] = ['storePath'];

/** Raised when the Recap server itself is unreachable or answers non-2xx. */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		/** Which form field the message belongs to, when the server said. */
		readonly field?: SettingsError['field'],
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export async function getJson<T>(path: string, query: Record<string, string> = {}): Promise<T> {
	const url = new URL(path, window.location.origin);
	for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
	return request<T>(url.toString(), {method: 'GET'});
}

export async function sendJson<T>(
	path: string,
	method: 'POST' | 'DELETE',
	body?: unknown,
): Promise<T> {
	return request<T>(path, {
		method,
		headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
	let response: Response;
	try {
		response = await fetch(url, init);
	} catch (cause) {
		// The Recap server is down or the page is offline. Distinct from a source
		// failing: nothing at all can be shown.
		throw new ApiError(cause instanceof Error ? cause.message : 'Network request failed', 0);
	}

	if (!response.ok) {
		// The server explains rejections in the body ("Choose a location outside
		// the project directory…"). Collapsing that to a status code would strip
		// the only actionable part.
		// Parsed defensively: this is untrusted JSON until proven otherwise, so the
		// body starts as `unknown` and is narrowed into the contract shape.
		const detail = await response
			.json()
			.then((body: Partial<Record<keyof SettingsError, unknown>>) =>
				typeof body?.error === 'string'
					? {message: body.error, field: ERROR_FIELDS.find((name) => name === body.field)}
					: null,
			)
			.catch(() => null);

		throw new ApiError(
			detail?.message ?? `Recap server responded ${response.status}`,
			response.status,
			detail?.field,
		);
	}

	return (await response.json()) as T;
}
