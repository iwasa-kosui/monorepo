import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyPostThread } from '../api/mastodonClient.ts';
import type { BlueskyItemsUpdater } from '../hooks/optimisticBlueskyLike.ts';

type Items = readonly IoriBlueskyTimelineItemBody[];
type ThreadNode = BlueskyPostThread['ancestors'][number];
type ItemsUpdater = Parameters<BlueskyItemsUpdater>[0];

const itemsOfNode = (node: ThreadNode): Items => node.kind === 'post' ? [node.item] : [];

export const threadItems = (thread: BlueskyPostThread): Items => [
  ...thread.ancestors.flatMap(itemsOfNode),
  thread.post,
  ...thread.replies.flatMap(({ node }) => itemsOfNode(node)),
];

export const updateThreadItems = (thread: BlueskyPostThread, updater: ItemsUpdater): BlueskyPostThread => {
  const current = threadItems(thread);
  const next = updater(current);
  if (next.length !== current.length) return thread;
  let index = 0;
  const take = (): IoriBlueskyTimelineItemBody => next[index++]!;
  const mapNode = (node: ThreadNode): ThreadNode => node.kind === 'post' ? { kind: 'post', item: take() } : node;
  const ancestors = thread.ancestors.map(mapNode);
  const post = take();
  const replies = thread.replies.map(({ depth, node }) => ({ depth, node: mapNode(node) }));
  return { ancestors, post, replies };
};
