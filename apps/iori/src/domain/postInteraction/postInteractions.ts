import type { ActorId } from '../actor/actorId.ts';
import type { Agg } from '../aggregate/index.ts';
import type { PostId } from '../post/postId.ts';

export type Interactor = Readonly<{
  actorId: ActorId | null;
  isLocal: boolean;
  name: string;
  acct: string;
  avatarUrl: string | null;
  url: string | null;
}>;

export type ReactionGroup = Readonly<{
  emoji: string;
  emojiImageUrl: string | null;
  actors: readonly Interactor[];
}>;

export type PostInteractions = Readonly<{
  likes: readonly Interactor[];
  reposts: readonly Interactor[];
  reactions: readonly ReactionGroup[];
}>;

export type StoredPostInteractionsResolver = Agg.Resolver<{ postId: PostId }, PostInteractions>;

export type RemotePostInteractionsFetcher = Readonly<{
  fetch: (
    post: Readonly<{ uri: string; url: string | null }>,
    signal: AbortSignal,
  ) => Promise<PostInteractions>;
}>;

const empty: PostInteractions = { likes: [], reposts: [], reactions: [] };

const keyOf = (interactor: Interactor): string => interactor.acct.toLowerCase();

const mergeActors = (first: readonly Interactor[], second: readonly Interactor[]): readonly Interactor[] => {
  const seen = new Set<string>();
  return [...first, ...second].filter((interactor) => {
    const key = keyOf(interactor);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mergeReactions = (
  first: readonly ReactionGroup[],
  second: readonly ReactionGroup[],
): readonly ReactionGroup[] => {
  const groups = new Map<string, ReactionGroup>();
  for (const group of [...first, ...second]) {
    const existing = groups.get(group.emoji);
    groups.set(
      group.emoji,
      existing === undefined
        ? { ...group, actors: mergeActors(group.actors, []) }
        : {
          emoji: existing.emoji,
          emojiImageUrl: existing.emojiImageUrl ?? group.emojiImageUrl,
          actors: mergeActors(existing.actors, group.actors),
        },
    );
  }
  return [...groups.values()].filter((group) => group.actors.length > 0);
};

const merge = (stored: PostInteractions, remote: PostInteractions): PostInteractions => ({
  likes: mergeActors(stored.likes, remote.likes),
  reposts: mergeActors(stored.reposts, remote.reposts),
  reactions: mergeReactions(stored.reactions, remote.reactions),
});

export const PostInteractions = {
  empty,
  merge,
} as const;
