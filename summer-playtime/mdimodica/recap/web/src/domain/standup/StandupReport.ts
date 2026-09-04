import type {ActivityEvent} from '../activity/ActivityEvent';
import {plural} from '../activity/ActivityFeed';
import type {DateRange} from '../time/DateRange';

/**
 * Turns a set of events into Markdown you can paste into Slack or Teams.
 *
 * Grouping follows what people actually say at standup:
 *   Shipped      — merged MRs, resolved tickets, closed issues
 *   In progress  — open MRs, tickets still moving
 *   Code         — commit volume, summarised per repo rather than listed
 *   Docs         — created vs edited kept separate (see below)
 *
 * Confluence's `contributor` matches pages you merely *edited*, so listing an
 * edit as if you wrote the page would overstate the work. Created and edited
 * therefore get different verbs.
 */
export class StandupReport {
	private constructor(private readonly markdown: string) {
	}

	static from(events: readonly ActivityEvent[], range: DateRange): StandupReport {
		return new StandupReport(render(events, range));
	}

	/** `recap-2026-08-12-to-2026-08-18.md` */
	static fileName(range: DateRange): string {
		return `recap-${range.from.toISO()}-to-${range.to.toISO()}.md`;
	}

	toMarkdown(): string {
		return this.markdown;
	}
}

function render(events: readonly ActivityEvent[], range: DateRange): string {
	const shipped: string[] = [];
	const inProgress: string[] = [];
	const docsCreated: string[] = [];
	const docsEdited: string[] = [];

	for (const event of events) {
		switch (event.kind) {
			case 'merge_request':
				if (event.action === 'merged') {
					shipped.push(
						`${ref('!', event)}${stripIid(event.title)} — merged into \`${event.meta.targetBranch ?? 'main'}\`${diffOf(event)}`,
					);
				} else if (event.action === 'closed') {
					shipped.push(`${ref('!', event)}${stripIid(event.title)} — closed without merge`);
				} else if (event.action === 'opened') {
					const pipeline = event.meta.pipeline ? `, pipeline ${event.meta.pipeline}` : '';
					inProgress.push(`${ref('!', event)}${stripIid(event.title)} — open${pipeline}`);
				}
				break;

			case 'ticket': {
				const [key = '', ...rest] = event.title.split(':');
				const summary = rest.join(':').trim();
				if (event.action === 'resolved') shipped.push(`\`${key}\` ${summary} (${event.meta.status ?? 'done'})`);
				else inProgress.push(`\`${key}\` ${summary} — ${event.meta.status ?? 'in progress'}`);
				break;
			}

			case 'issue':
				if (event.action === 'closed') {
					shipped.push(`${ref('#', event)}${stripIid(event.title)} — closed`);
				}
				break;

			case 'page': {
				const title = event.title.replace(/^(Created|Updated)\s+/, '').replace(/^["“]|["”]$/g, '');
				const version = event.meta.version ? `, v${event.meta.version}` : '';
				const where = event.meta.space ? ` (${event.meta.space}${version})` : '';
				const line = `*${title}*${where}`;
				if (event.action === 'created') docsCreated.push(line);
				else docsEdited.push(line);
				break;
			}

			default:
				break;
		}
	}

	const commits = events.filter((event) => event.kind === 'commit');
	const perRepo = new Map<string, number>();
	for (const commit of commits) {
		const repo = commit.project ?? 'unknown';
		perRepo.set(repo, (perRepo.get(repo) ?? 0) + 1);
	}

	const heading = `**Recap — ${range.describe()}**`;
	const nothing =
		shipped.length === 0 &&
		inProgress.length === 0 &&
		commits.length === 0 &&
		docsCreated.length === 0 &&
		docsEdited.length === 0;

	if (nothing) return `${heading}\n\nNo activity recorded in this timeframe.`;

	const lines: string[] = [heading];

	if (shipped.length) lines.push('', '**Shipped**', ...bullets(shipped));
	if (inProgress.length) lines.push('', '**In progress**', ...bullets(inProgress));

	if (commits.length) {
		const repos = [...perRepo.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([repo, count]) => `${repo} (${count})`);
		lines.push(
			'',
			'**Code**',
			`- ${plural(commits.length, 'commit')} across ${plural(perRepo.size, 'repo')}: ${repos.join(', ')}`,
		);
	}

	if (docsCreated.length || docsEdited.length) {
		lines.push('', '**Docs**');
		for (const doc of unique(docsCreated)) lines.push(`- Created ${doc}`);
		for (const doc of unique(docsEdited)) lines.push(`- Updated ${doc}`);
	}

	const merged = events.filter((e) => e.kind === 'merge_request' && e.action === 'merged').length;
	const resolved = events.filter((e) => e.kind === 'ticket' && e.action === 'resolved').length;
	const pages = events.filter((e) => e.kind === 'page').length;

	lines.push(
		'',
		'**Numbers**',
		[
			plural(commits.length, 'commit'),
			`${plural(merged, 'MR')} merged`,
			`${plural(resolved, 'ticket')} resolved`,
			`${plural(pages, 'page')} touched`,
		].join(' · '),
	);

	return lines.join('\n');
}

function bullets(items: string[]): string[] {
	return unique(items).map((item) => `- ${item}`);
}

function unique(items: string[]): string[] {
	return [...new Set(items)];
}

function diffOf(event: ActivityEvent): string {
	const {insertions, deletions} = event.meta;
	if (insertions == null || deletions == null) return '';
	return ` (+${insertions} / −${deletions})`;
}

/**
 * The reference, as inline code so Slack renders it distinctly: `` `!42` ``.
 * Pulled from meta rather than left inline in the title, which is why the
 * title then has it stripped.
 */
function ref(sigil: '!' | '#', event: ActivityEvent): string {
	return event.meta.iid == null ? '' : `\`${sigil}${event.meta.iid}\` `;
}

/** Titles already carry "!42" / "#42"; `ref()` re-adds it formatted. */
function stripIid(title: string): string {
	return title.replace(/^[!#]\d+\s*/, '');
}
