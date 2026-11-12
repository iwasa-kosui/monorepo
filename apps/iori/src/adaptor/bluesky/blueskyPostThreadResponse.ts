import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { BlueskyFetchedTimelineItem } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyPostThread, BlueskyThreadNode, BlueskyThreadReply } from '../../ports/blueskyPostThreadFetcher.ts';
import { type BlueskyPostView, itemFromPostView, postViewZodType, toInstant } from './blueskyPostView.ts';

export type BlueskyPostThreadParseError = 'invalid_response' | 'notFound' | 'blocked';

const THREAD_VIEW_POST = 'app.bsky.feed.defs#threadViewPost';
const NOT_FOUND_POST = 'app.bsky.feed.defs#notFoundPost';
const BLOCKED_POST = 'app.bsky.feed.defs#blockedPost';

const responseZodType = z.looseObject({ thread: z.unknown() });
const typedZodType = z.looseObject({ $type: z.string() });
const threadViewZodType = z.looseObject({
  post: postViewZodType,
  parent: z.unknown().optional(),
  replies: z.array(z.unknown()).optional(),
});
const unavailableZodType = z.looseObject({ uri: z.string().min(1) });

type ThreadView = z.infer<typeof threadViewZodType>;

const threadViewOf = (raw: unknown): ThreadView | undefined => {
  const typed = typedZodType.safeParse(raw);
  if (!typed.success || typed.data.$type !== THREAD_VIEW_POST) return undefined;
  const view = threadViewZodType.safeParse(raw);
  return view.success ? view.data : undefined;
};

const unavailableOf = (raw: unknown): Extract<BlueskyThreadNode, { kind: 'notFound' | 'blocked' }> | undefined => {
  const typed = typedZodType.safeParse(raw);
  if (!typed.success) return undefined;
  const kind = typed.data.$type === NOT_FOUND_POST
    ? 'notFound'
    : typed.data.$type === BLOCKED_POST
    ? 'blocked'
    : undefined;
  if (kind === undefined) return undefined;
  const unavailable = unavailableZodType.safeParse(raw);
  return unavailable.success ? { kind, uri: unavailable.data.uri } : undefined;
};

const itemOf = (
  post: BlueskyPostView,
  parentView: ThreadView | undefined,
  fetchedAt: Instant,
): BlueskyFetchedTimelineItem | undefined => {
  const postedAt = toInstant(post.record.createdAt);
  const indexedAt = toInstant(post.indexedAt);
  if (postedAt === undefined || indexedAt === undefined) return undefined;
  return itemFromPostView(post, {
    fetchedAt,
    indexedAt,
    postedAt,
    repostedByDid: null,
    repostedByHandle: null,
    replyParentAuthorHandle: parentView?.post.author.handle ?? null,
  });
};

const ancestorsOf = (view: ThreadView, fetchedAt: Instant): readonly BlueskyThreadNode[] => {
  const nodes: BlueskyThreadNode[] = [];
  let child = view;
  for (;;) {
    const parentView = threadViewOf(child.parent);
    if (parentView === undefined) {
      const unavailable = unavailableOf(child.parent);
      if (unavailable !== undefined) nodes.push(unavailable);
      break;
    }
    const item = itemOf(parentView.post, threadViewOf(parentView.parent), fetchedAt);
    if (item === undefined) break;
    nodes.push({ kind: 'post', item });
    child = parentView;
  }
  return nodes.reverse();
};

const repliesOf = (view: ThreadView, depth: number, fetchedAt: Instant): readonly BlueskyThreadReply[] =>
  (view.replies ?? []).flatMap((raw): readonly BlueskyThreadReply[] => {
    const replyView = threadViewOf(raw);
    if (replyView === undefined) {
      const unavailable = unavailableOf(raw);
      return unavailable === undefined ? [] : [{ depth, node: unavailable }];
    }
    const item = itemOf(replyView.post, view, fetchedAt);
    if (item === undefined) return [];
    return [{ depth, node: { kind: 'post', item } }, ...repliesOf(replyView, depth + 1, fetchedAt)];
  });

export const parseBlueskyPostThreadResponse = (
  payload: unknown,
  fetchedAt: Instant,
): Result<BlueskyPostThread, BlueskyPostThreadParseError> => {
  const response = responseZodType.safeParse(payload);
  if (!response.success) return Result.err('invalid_response');
  const unavailable = unavailableOf(response.data.thread);
  if (unavailable !== undefined) return Result.err(unavailable.kind);
  const view = threadViewOf(response.data.thread);
  if (view === undefined) return Result.err('invalid_response');
  const post = itemOf(view.post, threadViewOf(view.parent), fetchedAt);
  if (post === undefined) return Result.err('invalid_response');
  return Result.ok({ ancestors: ancestorsOf(view, fetchedAt), post, replies: repliesOf(view, 0, fetchedAt) });
};
