import { Article, Link, Note, type Object as ActivityPubObject, Question } from '@fedify/vocab';

import { escapeHtml } from '../../domain/post/textSyntax.ts';

export type RemotePostObject = Note | Article | Question;

export const isRemotePostObject = (value: unknown): value is RemotePostObject =>
  value instanceof Note || value instanceof Article || value instanceof Question;

const embeddedOnlyDocumentLoader = (): Promise<never> => Promise.reject(new Error('remote options are not fetched'));

const toLinkHref = (post: RemotePostObject): string | undefined => {
  const url = post.url;
  if (url instanceof URL) return url.href;
  if (url instanceof Link && url.href) return url.href.href;
  return post.id?.href;
};

const optionName = (option: ActivityPubObject): string => String(option.name ?? '');

const collectOptionNames = async (post: Question): Promise<string[]> => {
  const names: string[] = [];
  // 選択肢の取得で相手のサーバーに取りに行かない
  const options = { documentLoader: embeddedOnlyDocumentLoader, suppressError: true };
  try {
    for await (const option of post.getExclusiveOptions(options)) names.push(optionName(option));
    for await (const option of post.getInclusiveOptions(options)) names.push(optionName(option));
  } catch {
    return names;
  }
  return names;
};

const isBlank = (text: string): boolean => text.trim() === '';

const buildArticleContent = (post: Article): string => {
  const name = String(post.name ?? '');
  const content = String(post.content ?? '');
  const title = isBlank(name) ? '' : `<p><strong>${escapeHtml(name)}</strong></p>`;
  if (!isBlank(content)) return `${title}${content}`;
  const href = toLinkHref(post);
  return href === undefined ? title : `${title}<p><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></p>`;
};

const buildQuestionContent = async (post: Question): Promise<string> => {
  const content = String(post.content ?? '');
  const name = String(post.name ?? '');
  const body = !isBlank(content) ? content : isBlank(name) ? '' : `<p>${escapeHtml(name)}</p>`;
  const names = (await collectOptionNames(post)).filter((optionText) => !isBlank(optionText));
  const options = names.length === 0
    ? ''
    : `<ul>${names.map((optionText) => `<li>${escapeHtml(optionText)}</li>`).join('')}</ul>`;
  const href = toLinkHref(post);
  const link = href === undefined ? '' : `<p><a href="${escapeHtml(href)}">元の投稿で投票する</a></p>`;
  return `${body}${options}${link}`;
};

export const buildRemotePostContent = async (post: RemotePostObject): Promise<string> => {
  if (post instanceof Article) return buildArticleContent(post);
  if (post instanceof Question) return await buildQuestionContent(post);
  return String(post.content ?? '');
};
