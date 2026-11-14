import { describe, expect, it } from 'vitest';

import { ActorId } from '../actor/actorId.ts';
import { PostId } from '../post/postId.ts';
import { FediverseConversationKey } from './conversationKey.ts';
import {
  decodeDirectMessageCursor,
  type DirectMessagePost,
  encodeDirectMessageCursor,
  groupDirectMessagePosts,
} from './fediverseConversation.ts';

const me = 'https://iori.test/users/kosui';
const alice = 'https://remote.example/users/alice';
const bob = 'https://other.example/users/bob';
const keyOf = (...uris: string[]) => {
  const key = FediverseConversationKey.encode(uris);
  if (!key.ok) throw new Error('unreachable');
  return key.val;
};

const postOf = (
  n: number,
  participantUris: string[],
  overrides: Partial<DirectMessagePost> = {},
): DirectMessagePost => ({
  postId: PostId.orThrow(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`),
  authorActorId: ActorId.orThrow('00000000-0000-4000-8000-0000000000ff'),
  authorUri: alice,
  createdAt: n * 1000,
  content: `<p>${n}</p>`,
  unread: false,
  participantUris,
  ...overrides,
});

describe('groupDirectMessagePosts', () => {
  it('閲覧者を除いた参加者の組ごとに、新しい順の入力から、最後のメッセージと未読数をまとめる', () => {
    const posts = [
      postOf(5, [alice, me], { unread: true }),
      postOf(4, [bob, alice, me], { authorUri: me }),
      postOf(3, [me, alice], { unread: true }),
      postOf(2, [alice, me]),
      postOf(1, [bob, me], { unread: true }),
    ];

    expect(groupDirectMessagePosts(posts, me)).toEqual([
      {
        key: keyOf(alice),
        peerUris: [alice],
        last: { postId: posts[0]!.postId, createdAt: 5000, content: '<p>5</p>', own: false },
        unreadCount: 2,
      },
      {
        key: keyOf(alice, bob),
        peerUris: [bob, alice],
        last: { postId: posts[1]!.postId, createdAt: 4000, content: '<p>4</p>', own: true },
        unreadCount: 0,
      },
      {
        key: keyOf(bob),
        peerUris: [bob],
        last: { postId: posts[4]!.postId, createdAt: 1000, content: '<p>1</p>', own: false },
        unreadCount: 1,
      },
    ]);
  });

  it('参加者の並び順と重複に関わらず、同じ会話にまとめる', () => {
    const groups = groupDirectMessagePosts([postOf(2, [me, alice, alice]), postOf(1, [alice, me])], me);

    expect(groups).toHaveLength(1);
  });

  it('相手がいない投稿と、相手が 11 人以上の投稿は会話にしない', () => {
    const many = Array.from({ length: 11 }, (_, i) => `https://h.example/users/u${i}`);

    expect(groupDirectMessagePosts([postOf(1, [me]), postOf(2, [me, ...many]), postOf(3, [])], me)).toEqual([]);
  });
});

describe('direct の投稿の cursor', () => {
  it('日時と postId を往復できる', () => {
    const cursor = { createdAt: 1_794_484_800_000, postId: PostId.orThrow('00000000-0000-4000-8000-000000000001') };

    expect(decodeDirectMessageCursor(encodeDirectMessageCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    'nope',
    '123',
    '123_',
    '_00000000-0000-4000-8000-000000000001',
    'x_00000000-0000-4000-8000-000000000001',
  ])(
    '%s を拒む',
    (raw) => {
      expect(decodeDirectMessageCursor(raw)).toBeUndefined();
    },
  );

  it('postId が UUID として不正な cursor を拒む', () => {
    expect(decodeDirectMessageCursor('1000_zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz')).toBeUndefined();
  });
});
