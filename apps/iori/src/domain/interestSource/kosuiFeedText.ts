import type { InterestSourceKind } from './interestSource.ts';

export const KOSUI_POST_TEXT_MAX_CHARS = 2000;

const TALK_PREFIX = '[Talk] ';
const EXTERNAL_PREFIX = '[External] ';
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
const MODULE_LINE = /^(?:import|export) /;

type KosuiKind = Extract<InterestSourceKind, 'kosui_post' | 'kosui_talk' | 'kosui_external'>;

export const classifyKosuiEntry = (title: string): Readonly<{ kind: KosuiKind; title: string }> => {
  if (title.startsWith(TALK_PREFIX)) return { kind: 'kosui_talk', title: title.slice(TALK_PREFIX.length) };
  if (title.startsWith(EXTERNAL_PREFIX)) return { kind: 'kosui_external', title: title.slice(EXTERNAL_PREFIX.length) };
  return { kind: 'kosui_post', title };
};

export const extractMarkdownBody = (markdown: string): string =>
  markdown
    .replace(FRONTMATTER, '')
    .split(/\r?\n/)
    .filter((line) => !MODULE_LINE.test(line))
    .join('\n')
    .trim();

export const buildKosuiPostText = (title: string, markdown: string): string =>
  Array.from(`${title}\n${extractMarkdownBody(markdown)}`).slice(0, KOSUI_POST_TEXT_MAX_CHARS).join('');

export const buildKosuiSummaryText = (title: string, description: string): string => `${title}\n${description}`;
