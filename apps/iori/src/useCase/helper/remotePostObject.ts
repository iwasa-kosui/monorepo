import { Article, Link, Note, type Object as ActivityPubObject, Question } from '@fedify/vocab';

import { Instant } from '../../domain/instant/instant.ts';
import { RemotePostPoll } from '../../domain/post/remotePostPoll.ts';
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

const isBlank = (text: string): boolean => text.trim() === '';

const MAX_POLL_OPTIONS = 50;

type PollOption = Readonly<{ title: string; votesCount: number }>;
type LoaderOptions = Readonly<{ documentLoader: () => Promise<never>; suppressError: true }>;

const optionVotesCount = async (option: ActivityPubObject, options: LoaderOptions): Promise<number> => {
  try {
    const replies = await option.getReplies(options);
    const totalItems = replies?.totalItems;
    return typeof totalItems === 'number' && Number.isSafeInteger(totalItems) && totalItems >= 0 ? totalItems : 0;
  } catch {
    return 0;
  }
};

const collectOptions = async (
  iterable: AsyncIterable<ActivityPubObject>,
  options: LoaderOptions,
): Promise<PollOption[]> => {
  const collected: PollOption[] = [];
  try {
    for await (const option of iterable) {
      const title = String(option.name ?? '');
      if (isBlank(title)) continue;
      collected.push({ title, votesCount: await optionVotesCount(option, options) });
    }
  } catch {
    return collected;
  }
  return collected;
};

const readPoll = async (post: Question): Promise<RemotePostPoll | undefined> => {
  // 選択肢の取得で相手のサーバーに取りに行かない
  const options: LoaderOptions = { documentLoader: embeddedOnlyDocumentLoader, suppressError: true };
  const exclusive = await collectOptions(post.getExclusiveOptions(options), options);
  const inclusive = await collectOptions(post.getInclusiveOptions(options), options);
  const pollOptions = [...exclusive, ...inclusive].slice(0, MAX_POLL_OPTIONS);
  if (pollOptions.length === 0) return undefined;
  const endTime = post.endTime?.epochMilliseconds;
  const expiresAt = endTime === undefined ? null : Instant.of(endTime);
  const closed = post.closed;
  const candidate = {
    multiple: exclusive.length === 0 && inclusive.length > 0,
    options: pollOptions,
    votersCount: post.voters,
    expiresAt: expiresAt?.ok ? expiresAt.val : null,
    closed: (closed !== null && closed !== false) || (expiresAt?.ok === true && expiresAt.val <= Instant.now()),
  };
  const parsed = RemotePostPoll.parse(candidate);
  if (parsed.ok) return parsed.val;
  const withoutVoters = RemotePostPoll.parse({ ...candidate, votersCount: null });
  return withoutVoters.ok ? withoutVoters.val : undefined;
};

const buildArticleContent = (post: Article): string => {
  const name = String(post.name ?? '');
  const content = String(post.content ?? '');
  const summary = String(post.summary ?? '');
  const title = isBlank(name) ? '' : `<p><strong>${escapeHtml(name)}</strong></p>`;
  const body = !isBlank(content) ? content : isBlank(summary) ? '' : summary;
  const href = toLinkHref(post);
  const link = href === undefined ? '' : `<p><a href="${escapeHtml(href)}">元の記事を読む</a></p>`;
  return `${title}${body}${link}`;
};

const buildQuestionContent = (post: Question): string => {
  const content = String(post.content ?? '');
  const name = String(post.name ?? '');
  const body = !isBlank(content) ? content : isBlank(name) ? '' : `<p>${escapeHtml(name)}</p>`;
  const href = toLinkHref(post);
  const link = href === undefined ? '' : `<p><a href="${escapeHtml(href)}">元の投稿で投票する</a></p>`;
  return `${body}${link}`;
};

export const buildRemotePostContent = async (post: RemotePostObject): Promise<string> => {
  if (post instanceof Article) return buildArticleContent(post);
  if (post instanceof Question) return buildQuestionContent(post);
  return String(post.content ?? '');
};

export const readRemotePostPoll = async (post: RemotePostObject): Promise<RemotePostPoll | undefined> =>
  post instanceof Question ? await readPoll(post) : undefined;

export const buildRemotePostBody = async (
  post: RemotePostObject,
): Promise<Readonly<{ content: string; poll?: RemotePostPoll }>> => {
  const poll = await readRemotePostPoll(post);
  const content = await buildRemotePostContent(post);
  return poll === undefined ? { content } : { content, poll };
};
