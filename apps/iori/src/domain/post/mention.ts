import { Marked, type Token, type TokenizerAndRendererExtension } from 'marked';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { escapeHtml, URL_PATTERN } from './textSyntax.ts';

export const MAX_MENTIONS = 10;

export type ResolvedMentions = ReadonlyMap<string, string>;

export type MentionFormat = 'markdown' | 'plain';

export type MentionLink = Readonly<{ href: string; name: string }>;

const recipientZodType = z.object({
  id: z.url(),
  inboxUrl: z.url(),
  sharedInboxUrl: z.url().optional(),
}).describe('MentionRecipient');

export type MentionRecipient = z.infer<typeof recipientZodType>;

export const MentionRecipient = Schema.create(recipientZodType);

const ACCT_SOURCE = String
  .raw`@([A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*)@((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)(?![A-Za-z0-9_@])`;
const ACCT_ANYWHERE = new RegExp(ACCT_SOURCE);
const ACCT_AT_HEAD = new RegExp(`^${ACCT_SOURCE}`);
const ACCT_IN_TEXT = new RegExp(`(?<![A-Za-z0-9_./@])${ACCT_SOURCE}`, 'g');
const PRECEDING_CHAR = /[A-Za-z0-9_./@]/;

const normalizeAcct = (user: string, host: string): string => `${user}@${host}`.toLowerCase();

const displayAcct = (user: string, host: string): string => `${user}@${host.toLowerCase()}`;

const lowerCaseKeys = (mentions: ResolvedMentions): ResolvedMentions =>
  new Map([...mentions].map(([acct, href]) => [acct.toLowerCase(), href]));

const mentionHtml = (label: string, href: string): string =>
  `<span class="h-card"><a href="${escapeHtml(href)}" class="u-url mention">@<span>${
    escapeHtml(label)
  }</span></a></span>`;

type MentionToken = Readonly<
  { type: 'mention'; raw: string; acct: string; label: string; href: string | undefined }
>;

const isMentionToken = (token: Token): token is Token & MentionToken => token.type === 'mention';

export const createMentionExtension = (mentions: ResolvedMentions = new Map()): TokenizerAndRendererExtension => {
  const table = lowerCaseKeys(mentions);
  return {
    name: 'mention',
    level: 'inline',
    start: (src) => {
      const index = src.search(ACCT_ANYWHERE);
      return index < 0 ? undefined : index;
    },
    tokenizer(src, tokens) {
      if (this.lexer.state.inLink) {
        return undefined;
      }
      const match = ACCT_AT_HEAD.exec(src);
      if (match === null) {
        return undefined;
      }
      const preceding = tokens.at(-1)?.raw.at(-1);
      if (preceding !== undefined && PRECEDING_CHAR.test(preceding)) {
        return undefined;
      }
      const acct = normalizeAcct(match[1] ?? '', match[2] ?? '');
      const label = displayAcct(match[1] ?? '', match[2] ?? '');
      const token: MentionToken = { type: 'mention', raw: match[0], acct, label, href: table.get(acct) };
      return token;
    },
    renderer(token) {
      const { raw, label, href } = token as MentionToken;
      return href === undefined ? escapeHtml(raw) : mentionHtml(label, href);
    },
  };
};

const acctsOfMarkdown = (markdown: string): ReadonlyArray<string> => {
  const marked = new Marked({ extensions: [createMentionExtension()] });
  const accts: string[] = [];
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (isMentionToken(token)) {
      accts.push(token.acct);
    }
  });
  return accts;
};

const acctsOfPlainText = (text: string): ReadonlyArray<string> =>
  [...text.replace(URL_PATTERN, ' ').matchAll(ACCT_IN_TEXT)].map((match) =>
    normalizeAcct(match[1] ?? '', match[2] ?? '')
  );

export const extractMentionAccts = (text: string, format: MentionFormat): ReadonlyArray<string> => {
  const accts = format === 'markdown' ? acctsOfMarkdown(text) : acctsOfPlainText(text);
  return [...new Set(accts)].slice(0, MAX_MENTIONS);
};

export const escapeWithMentions = (text: string, mentions: ResolvedMentions): string => {
  if (mentions.size === 0) {
    return escapeHtml(text);
  }
  const table = lowerCaseKeys(mentions);
  let html = '';
  let cursor = 0;
  for (const match of text.matchAll(ACCT_IN_TEXT)) {
    const acct = normalizeAcct(match[1] ?? '', match[2] ?? '');
    const href = table.get(acct);
    html += escapeHtml(text.slice(cursor, match.index));
    html += href === undefined ? escapeHtml(match[0]) : mentionHtml(displayAcct(match[1] ?? '', match[2] ?? ''), href);
    cursor = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(cursor));
};

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const CLASS_ATTRIBUTE = /\bclass\s*=\s*"([^"]*)"/i;
const HREF_ATTRIBUTE = /\bhref\s*=\s*"([^"]*)"/i;
const MENTION_NAME = /^@[^\s@]+@[^\s@]+$/;

const decodeEntities = (text: string): string =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', '\'')
    .replaceAll('&amp;', '&');

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

export const mentionLinksOfHtml = (html: string): ReadonlyArray<MentionLink> => {
  const links = new Map<string, MentionLink>();
  for (const match of html.matchAll(ANCHOR)) {
    const attributes = match[1] ?? '';
    const classes = (CLASS_ATTRIBUTE.exec(attributes)?.[1] ?? '').split(/\s+/);
    const href = decodeEntities(HREF_ATTRIBUTE.exec(attributes)?.[1] ?? '');
    const name = decodeEntities((match[2] ?? '').replace(/<[^>]*>/g, '')).trim();
    if (classes.includes('mention') && isHttpUrl(href) && MENTION_NAME.test(name) && !links.has(href)) {
      links.set(href, { href, name });
    }
  }
  return [...links.values()].slice(0, MAX_MENTIONS);
};
