import type { ActorId } from '../actor/actorId.ts';
import type { Agg } from '../aggregate/index.ts';
import { PostId } from '../post/postId.ts';
import type { UserId } from '../user/userId.ts';
import { FediverseConversationKey } from './conversationKey.ts';

export const FEDIVERSE_CONVERSATION_SCAN_LIMIT = 200;
export const FEDIVERSE_CONVERSATION_MESSAGES_LIMIT = 30;
export const FEDIVERSE_CONVERSATION_UNREAD_SCAN_LIMIT = 500;

export type FediverseConversationViewer = Readonly<{ userId: UserId; actorId: ActorId; actorUri: string }>;

export type DirectMessagePost = Readonly<{
  postId: PostId;
  authorActorId: ActorId;
  authorUri: string;
  createdAt: number;
  content: string;
  unread: boolean;
  participantUris: ReadonlyArray<string>;
}>;

export type DirectMessagePostCursor = Readonly<{ createdAt: number; postId: PostId }>;

export type DirectMessagePostsCondition = Readonly<{
  viewer: FediverseConversationViewer;
  participantUris?: ReadonlyArray<string>;
  unreadOnly?: boolean;
  before?: DirectMessagePostCursor;
  limit: number;
}>;

export type DirectMessagePostsResolver = Agg.Resolver<DirectMessagePostsCondition, ReadonlyArray<DirectMessagePost>>;

export type DirectMessageActor = Readonly<{
  actorId: ActorId;
  uri: string;
  inboxUrl: string;
  type: 'local' | 'remote';
}>;

export type DirectMessageActorsResolverByUris = Agg.Resolver<
  ReadonlyArray<string>,
  ReadonlyMap<string, DirectMessageActor>
>;

export type DirectMessageNotificationsReadMarker = Readonly<{
  markRead: (input: Readonly<{ userId: UserId; postIds: ReadonlyArray<PostId> }>) => Promise<void>;
}>;

export type FediverseConversationGroup = Readonly<{
  key: string;
  peerUris: ReadonlyArray<string>;
  last: Readonly<{ postId: PostId; createdAt: number; content: string; own: boolean }>;
  unreadCount: number;
}>;

export const peerUrisOf = (post: DirectMessagePost, viewerUri: string): ReadonlyArray<string> =>
  [...new Set(post.participantUris.filter((uri) => uri !== viewerUri))].sort();

export const groupDirectMessagePosts = (
  posts: ReadonlyArray<DirectMessagePost>,
  viewerUri: string,
): ReadonlyArray<FediverseConversationGroup> => {
  const groups = new Map<string, FediverseConversationGroup>();
  for (const post of posts) {
    const peerUris = peerUrisOf(post, viewerUri);
    const key = FediverseConversationKey.encode(peerUris);
    if (!key.ok) continue;
    const known = groups.get(key.val);
    groups.set(
      key.val,
      known === undefined
        ? {
          key: key.val,
          peerUris,
          last: {
            postId: post.postId,
            createdAt: post.createdAt,
            content: post.content,
            own: post.authorUri === viewerUri,
          },
          unreadCount: post.unread ? 1 : 0,
        }
        : { ...known, unreadCount: known.unreadCount + (post.unread ? 1 : 0) },
    );
  }
  return [...groups.values()];
};

export const encodeDirectMessageCursor = (cursor: DirectMessagePostCursor): string =>
  `${cursor.createdAt}_${cursor.postId}`;

const cursorPattern = /^(\d{1,16})_([0-9a-fA-F-]{36})$/;

export const decodeDirectMessageCursor = (raw: string): DirectMessagePostCursor | undefined => {
  const match = cursorPattern.exec(raw);
  if (match === null) return undefined;
  const postId = PostId.parse(match[2]);
  return postId.ok ? { createdAt: Number(match[1]), postId: postId.val } : undefined;
};
