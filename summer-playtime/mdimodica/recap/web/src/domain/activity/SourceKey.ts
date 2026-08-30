import {SOURCE_KEYS, type SourceKey} from '@shared/contracts';

// The key set is part of the wire contract; presentation metadata is not.
export {SOURCE_KEYS};
export type {SourceKey};

export interface SourceDescriptor {
	readonly key: SourceKey;
	/** Full name, for the sources rail and setup screen. */
	readonly name: string;
	/** Abbreviated, for chips and filter pills. */
	readonly short: string;
	/** CSS custom property holding this source's hue. */
	readonly colourVar: string;
	readonly iconUrl: string;
	/** Tint behind the icon on a summary card. */
	readonly tint: string;
}

export const SOURCES: Record<SourceKey, SourceDescriptor> = {
	git: {
		key: 'git',
		name: 'Git (local)',
		short: 'Git',
		colourVar: 'var(--src-git)',
		iconUrl: '/assets/git.png',
		tint: 'rgba(240, 101, 58, 0.14)',
	},
	gitlab: {
		key: 'gitlab',
		name: 'GitLab',
		short: 'GitLab',
		colourVar: 'var(--src-gitlab)',
		iconUrl: '/assets/gitlab.png',
		tint: 'rgba(252, 109, 38, 0.14)',
	},
	jira: {
		key: 'jira',
		name: 'Jira',
		short: 'Jira',
		colourVar: 'var(--src-jira)',
		iconUrl: '/assets/jira.png',
		tint: 'rgba(47, 102, 241, 0.16)',
	},
	confluence: {
		key: 'confluence',
		name: 'Confluence',
		short: 'Confluence',
		colourVar: 'var(--src-confluence)',
		iconUrl: '/assets/confluence.png',
		tint: 'rgba(43, 184, 230, 0.14)',
	},
};

export const SOURCE_LIST: readonly SourceDescriptor[] = SOURCE_KEYS.map((key) => SOURCES[key]);
