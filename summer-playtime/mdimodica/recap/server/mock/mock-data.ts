import {faker} from '@faker-js/faker';

import type {ActivityEventDto} from '../../shared/contracts.js';
import {makeEvent} from '../lib/events.js';
import type {DateWindow} from '../adapters/types.js';

/**
 * Demo Mode fixtures.
 *
 * Goal: someone clones the repo, runs `npm run start:demo`, and sees a full,
 * plausible dashboard in five seconds with zero configuration and zero network
 * calls.
 *
 * The generator is seeded, so the same window always produces the same recap —
 * screenshots stay stable and the "Copy for Standup" output does not churn
 * between refreshes.
 *
 * Everything here is invented. No real person, repository, ticket or hostname
 * appears in this file.
 */

const REPOS = ['payments-api', 'payments-tools', 'curation-frontend', 'curation-backend'];

const BRANCHES = [
	'main',
	'feat/webhook-retry',
	'feat/worker-split',
	'chore/kafka-3.7',
	'fix/token-refresh',
];

const SPACES = [
	{key: 'ENG', name: 'Engineering - Platform'},
	{key: 'TEAM', name: 'Payments Squad'},
];

/** Invented identities for the fixtures. */
const ME = {name: 'Alex Rivera', email: 'dev@example.com'};
const TEAMMATE = 'Sam Okafor';

const COMMIT_SUBJECTS = [
	'harden webhook signature check',
	'update README with retry policy',
	'extract WebhookWorker, add backoff test',
	'seed script for replayable webhook fixtures',
	'fix flaky idempotency test',
	'bump kafka client to 3.7',
	'drop unused troubleshooter columns',
	'cache role lookups per request',
	'add vitest config and migrate first suite',
	'tighten CSP on admin routes',
	'handle 429 from provider with jittered retry',
	'split settlement report into workers',
];

const MR_TITLES = [
	'payments: idempotent retry on webhook',
	'chore: bump kafka client to 3.7',
	'feat: troubleshooter stage inspector',
	'fix: change-my-password endpoint',
	'refactor: classes into interfaces',
];

interface TicketFixture {
	key: string;
	summary: string;
	type: string;
	status: string;
	priority: string;
}

const TICKETS: TicketFixture[] = [
	{key: 'FIX-102', summary: 'Resolved auth token refresh loop', type: 'Bug', status: 'Done', priority: 'P1'},
	{
		key: 'PAY-318',
		summary: 'Split webhook consumer into workers',
		type: 'Story',
		status: 'In Review',
		priority: 'P2'
	},
	{key: 'FIX-097', summary: 'Fixed double charge on retry', type: 'Bug', status: 'Done', priority: 'P1'},
	{
		key: 'PLAT-1691',
		summary: 'Troubleshooter Phase 2 - stage inspector',
		type: 'Task',
		status: 'Done',
		priority: 'P2'
	},
	{key: 'PLAT-1331', summary: 'Migrate from Jest to Vitest', type: 'Task', status: 'In Progress', priority: 'P3'},
	{key: 'PLAT-1763', summary: 'Fix change my password endpoint', type: 'Bug', status: 'Done', priority: 'P2'},
	{key: 'DEMAND-204', summary: 'Segment availability badges in UI', type: 'Story', status: 'Done', priority: 'P2'},
];

interface PageFixture {
	title: string;
	space: number;
	action: 'created' | 'edited';
	note: string;
}

const PAGES: PageFixture[] = [
	{
		title: 'Payments — retry & idempotency',
		space: 0,
		action: 'edited',
		note: 'added sequence diagram and rollout notes'
	},
	{title: 'Standup notes — Payments squad', space: 1, action: 'created', note: 'template for weekly retro inputs'},
	{title: 'Authorities migration test plan', space: 0, action: 'edited', note: 'covered pre-existing endpoints'},
];

/**
 * Generate mock events across the requested window.
 * Density tapers on weekends, which makes the "Activity by day" chart look
 * like a real week rather than a flat block.
 */
export function generateMockEvents({from, to}: DateWindow): ActivityEventDto[] {
	faker.seed(seedFor(from, to));

	const start = new Date(from);
	const end = new Date(to);
	const events: ActivityEventDto[] = [];

	const days: Date[] = [];
	for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
		days.push(new Date(day));
	}

	for (const day of days) {
		const weekend = isWeekend(day);
		const commits = weekend
			? faker.number.int({min: 0, max: 1})
			: faker.number.int({min: 2, max: 7});

		for (let i = 0; i < commits; i += 1) events.push(mockCommit(day));

		if (!weekend && chance(55)) events.push(mockMr(day));
		if (!weekend && chance(70)) events.push(mockTicket(day));
		if (!weekend && chance(45)) events.push(mockPage(day));
	}

	return guaranteeCoverage(withinWindow(events, start, end), days, start, end);
}

/**
 * The point of Demo Mode is that an evaluator sees a *complete* dashboard on
 * first run. Pure randomness can leave a short window with no Confluence page
 * or no open MR, which reads as a broken integration rather than a quiet week.
 * So we top up anything missing on a weekday inside the window.
 */
function guaranteeCoverage(
	events: ActivityEventDto[],
	days: Date[],
	start: Date,
	end: Date,
): ActivityEventDto[] {
	const weekdays = days.filter((day) => !isWeekend(day) && day >= start && day <= end);
	if (!weekdays.length) return events;

	const pick = (index: number): Date => weekdays[index % weekdays.length] ?? weekdays[0]!;
	const out = [...events];
	const missing = (predicate: (event: ActivityEventDto) => boolean): boolean =>
		!out.some(predicate);

	if (missing((e) => e.source === 'confluence')) out.push(mockPage(pick(1)));
	if (missing((e) => e.source === 'jira')) out.push(mockTicket(pick(2)));
	if (missing((e) => e.kind === 'merge_request' && e.action === 'merged')) {
		out.push(forceMr(pick(3), true));
	}
	if (missing((e) => e.kind === 'merge_request' && e.action === 'opened')) {
		out.push(forceMr(pick(4), false));
	}

	return withinWindow(out, start, end);
}

function withinWindow(
	events: ActivityEventDto[],
	start: Date,
	end: Date,
): ActivityEventDto[] {
	return events.filter((event) => {
		const time = new Date(event.timestamp).getTime();
		return time >= start.getTime() && time <= end.getTime();
	});
}

function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6;
}

function chance(percent: number): boolean {
	return faker.number.int({min: 0, max: 100}) < percent;
}

function at(day: Date, hour: number, minute: number): string {
	const date = new Date(day);
	date.setHours(hour, minute, 0, 0);
	return date.toISOString();
}

function workHour(): number {
	return faker.number.int({min: 8, max: 18});
}

function minute(): number {
	return faker.number.int({min: 0, max: 59});
}

function mockCommit(day: Date): ActivityEventDto {
	const repo = faker.helpers.arrayElement(REPOS);
	const sha = faker.string.hexadecimal({length: 7, casing: 'lower', prefix: ''});

	return makeEvent({
		id: `git:${repo}:${sha}:${day.getTime()}`,
		source: 'git',
		kind: 'commit',
		action: 'committed',
		title: faker.helpers.arrayElement(COMMIT_SUBJECTS),
		url: null,
		timestamp: at(day, workHour(), minute()),
		project: repo,
		meta: {
			sha,
			branch: faker.helpers.arrayElement(BRANCHES),
			author: ME.name,
			authorEmail: ME.email,
			insertions: faker.number.int({min: 3, max: 340}),
			deletions: faker.number.int({min: 0, max: 120}),
			files: faker.number.int({min: 1, max: 12}),
		},
	});
}

function mockMr(day: Date): ActivityEventDto {
	return forceMr(day, faker.datatype.boolean({probability: 0.65}));
}

function forceMr(day: Date, merged: boolean): ActivityEventDto {
	const iid = faker.number.int({min: 240, max: 320});
	const repo = faker.helpers.arrayElement(REPOS);

	return makeEvent({
		id: `gitlab:mr:${iid}:${day.getTime()}`,
		source: 'gitlab',
		kind: 'merge_request',
		action: merged ? 'merged' : 'opened',
		title: `!${iid} ${faker.helpers.arrayElement(MR_TITLES)}`,
		url: `https://gitlab.example.com/${repo}/-/merge_requests/${iid}`,
		timestamp: at(day, workHour(), minute()),
		project: repo,
		meta: {
			iid,
			state: merged ? 'merged' : 'opened',
			sourceBranch: faker.helpers.arrayElement(BRANCHES.slice(1)),
			targetBranch: 'main',
			draft: false,
			insertions: faker.number.int({min: 9, max: 420}),
			deletions: faker.number.int({min: 2, max: 150}),
			approvals: merged ? faker.number.int({min: 1, max: 3}) : 0,
			pipeline: faker.helpers.arrayElement(['success', 'success', 'running', 'failed']),
		},
	});
}

function mockTicket(day: Date): ActivityEventDto {
	const ticket = faker.helpers.arrayElement(TICKETS);
	const resolved = ticket.status === 'Done';

	return makeEvent({
		id: `jira:${ticket.key}:${day.getTime()}`,
		source: 'jira',
		kind: 'ticket',
		action: resolved ? 'resolved' : 'updated',
		title: `${ticket.key}: ${ticket.summary}`,
		url: `https://jira.example.com/browse/${ticket.key}`,
		timestamp: at(day, workHour(), minute()),
		project: ticket.key.split('-')[0] ?? null,
		meta: {
			key: ticket.key,
			status: ticket.status,
			statusCategory: resolved ? 'done' : 'indeterminate',
			issueType: ticket.type,
			priority: ticket.priority,
		},
	});
}

function mockPage(day: Date): ActivityEventDto {
	const page = faker.helpers.arrayElement(PAGES);
	const space = SPACES[page.space] ?? SPACES[0]!;
	const created = page.action === 'created';

	return makeEvent({
		id: `confluence:${faker.string.numeric(10)}:${day.getTime()}`,
		source: 'confluence',
		kind: 'page',
		action: page.action,
		title: `${created ? 'Created' : 'Updated'} “${page.title}”`,
		url: 'https://wiki.example.com',
		timestamp: at(day, workHour(), minute()),
		precision: 'exact',
		project: space.key,
		meta: {
			space: space.key,
			spaceName: space.name,
			version: faker.number.int({min: 2, max: 11}),
			authoredByMe: created,
			pageAuthor: created ? ME.name : TEAMMATE,
			note: page.note,
		},
	});
}

/** Stable seed so the same window always yields the same demo data. */
function seedFor(from: string, to: string): number {
	const key = `${new Date(from).toDateString()}|${new Date(to).toDateString()}`;
	let hash = 0;
	for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
	return hash;
}
