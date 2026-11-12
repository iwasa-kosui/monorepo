import type { RequestContext } from '@fedify/fedify';
import { Create, Note, Person, Question } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { Actor, LocalActor } from '../../domain/actor/actor.ts';
import type { Post } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { RemotePostPoll } from '../../domain/post/remotePostPoll.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { VotePollUseCase } from '../votePoll.ts';
import {
  createMockActorResolverByUserId,
  createMockPostResolver,
  createMockRequestContext,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

const AUTHOR_URI = 'https://remote.example/users/alice';
const QUESTION_URI = 'https://remote.example/questions/1';

const poll = (overrides: Partial<RemotePostPoll> = {}): RemotePostPoll => ({
  multiple: false,
  options: [{ title: '赤', votesCount: 3 }, { title: '青', votesCount: 5 }, { title: '緑', votesCount: 0 }],
  votersCount: 8,
  expiresAt: null,
  closed: false,
  ...overrides,
});

const setup = (
  options: Readonly<{
    poll?: RemotePostPoll | null;
    ownChoices?: ReadonlyArray<number>;
    isBlockedUri?: (uri: string) => boolean;
    blockedActor?: boolean;
    lookup?: unknown;
    postType?: 'remote' | 'local' | 'none';
  }> = {},
) => {
  const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
  const actor: LocalActor = {
    id: crypto.randomUUID() as LocalActor['id'],
    userId: user.id,
    uri: 'https://example.com/users/kosui',
    inboxUrl: 'https://example.com/inbox',
    type: 'local',
    logoUri: undefined,
  };
  const author = {
    id: crypto.randomUUID() as Actor['id'],
    type: 'remote',
    uri: AUTHOR_URI,
    inboxUrl: `${AUTHOR_URI}/inbox`,
  } as unknown as Actor;
  const userResolver = createMockUserResolver();
  userResolver.setUser(user);
  const actorResolverByUserId = createMockActorResolverByUserId();
  actorResolverByUserId.setActor(actor);
  const postResolver = createMockPostResolver();
  const postId = crypto.randomUUID() as PostId;
  const postType = options.postType ?? 'remote';
  if (postType === 'remote') {
    postResolver.setPost({ type: 'remote', postId, actorId: author.id, uri: QUESTION_URI } as unknown as Post);
  } else if (postType === 'local') {
    postResolver.setPost({ type: 'local', postId, actorId: actor.id, userId: user.id } as unknown as Post);
  }
  const savedPoll = options.poll === undefined ? poll() : options.poll;
  const deps = {
    sessionResolver: { resolve: vi.fn() } as never,
    userResolver,
    actorResolverByUserId,
    actorResolverById: { resolve: vi.fn(() => RA.ok(author)) },
    postResolver,
    remotePostPollsResolver: {
      resolve: vi.fn(() => RA.ok(new Map(savedPoll === null ? [] : [[postId, savedPoll]]))),
    },
    remotePostPollVotesResolver: {
      resolve: vi.fn(() => RA.ok(new Map([[postId, options.ownChoices ?? []]]))),
    },
    remotePostPollVotedStore: { store: vi.fn(() => RA.ok(undefined)) },
    blockedActorUriResolverByUsername: { resolve: vi.fn(() => RA.ok(options.blockedActor ?? false)) },
    isBlockedUri: options.isBlockedUri ?? (() => false),
  };
  const authorPerson = new Person({ id: new URL(AUTHOR_URI), inbox: new URL(`${AUTHOR_URI}/inbox`) });
  const lookupObject = vi.fn().mockResolvedValue(
    options.lookup === undefined
      ? new Question({ id: new URL(QUESTION_URI), content: 'q', attribution: authorPerson })
      : options.lookup,
  );
  const ctx = createMockRequestContext();
  Object.assign(ctx, { getDocumentLoader: vi.fn().mockResolvedValue({}), lookupObject });
  const run = (choices: ReadonlyArray<number>) =>
    VotePollUseCase.create(deps).run({ userId: user.id, postId, choices, ctx: ctx as RequestContext<unknown> });
  const sent = () =>
    vi.mocked(ctx.sendActivity).mock.calls.map((call) => {
      const [sender, recipient, activity] = call as unknown as [unknown, unknown, Create];
      return { sender, recipient, activity };
    });
  return { run, deps, ctx, user, actor, author, authorPerson, postId, sent, lookupObject };
};

const expectRejected = async (
  t: ReturnType<typeof setup>,
  choices: ReadonlyArray<number>,
  type: string,
  reason?: string,
) => {
  const result = await t.run(choices);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.err.type).toBe(type);
    if (reason !== undefined) expect(result.err).toMatchObject({ detail: { reason } });
  }
  expect(t.deps.remotePostPollVotedStore.store).not.toHaveBeenCalled();
  expect(t.ctx.sendActivity).not.toHaveBeenCalled();
};

describe('VotePollUseCase', () => {
  describe('拒否する場合', () => {
    it('投稿が無ければ PostNotFoundError を返す', async () => {
      await expectRejected(setup({ postType: 'none' }), [0], 'PostNotFoundError');
    });

    it('ローカルの投稿なら PollNotFoundError を返す', async () => {
      await expectRejected(setup({ postType: 'local' }), [0], 'PollNotFoundError');
    });

    it('投票を保存していないリモートの投稿なら PollNotFoundError を返す', async () => {
      await expectRejected(setup({ poll: null }), [0], 'PollNotFoundError');
    });

    it('closed の投票なら PollClosedError を返す', async () => {
      await expectRejected(setup({ poll: poll({ closed: true }) }), [0], 'PollClosedError');
    });

    it('締め切りが過去の投票なら PollClosedError を返す', async () => {
      const expiresAt = (Date.now() - 1_000) as NonNullable<RemotePostPoll['expiresAt']>;

      await expectRejected(setup({ poll: poll({ expiresAt }) }), [0], 'PollClosedError');
    });

    it('既に投票済みなら AlreadyVotedError を返す', async () => {
      await expectRejected(setup({ ownChoices: [1] }), [0], 'AlreadyVotedError');
    });

    it('choices が空なら InvalidPollChoicesError を返す', async () => {
      await expectRejected(setup(), [], 'InvalidPollChoicesError', 'empty');
    });

    it.each([[3], [-1], [1.5], [Number.NaN]])(
      '選択肢の範囲外の %s なら InvalidPollChoicesError を返す',
      async (choice) => {
        await expectRejected(
          setup({ poll: poll({ multiple: true }) }),
          [0, choice],
          'InvalidPollChoicesError',
          'outOfRange',
        );
      },
    );

    it('choices に重複があれば InvalidPollChoicesError を返す', async () => {
      await expectRejected(setup({ poll: poll({ multiple: true }) }), [1, 1], 'InvalidPollChoicesError', 'duplicated');
    });

    it('単一選択の投票で choices が 2 つ以上なら InvalidPollChoicesError を返す', async () => {
      await expectRejected(setup(), [0, 1], 'InvalidPollChoicesError', 'tooMany');
    });

    it('ブロックしたドメインの投票なら PollAuthorBlockedError を返す', async () => {
      const isBlockedUri = vi.fn((uri: string) => uri.startsWith('https://remote.example/'));

      await expectRejected(setup({ isBlockedUri }), [0], 'PollAuthorBlockedError');
      expect(isBlockedUri).toHaveBeenCalledWith(QUESTION_URI);
    });

    it('投票の作者のドメインがブロック対象なら PollAuthorBlockedError を返す', async () => {
      const isBlockedUri = vi.fn((uri: string) => uri === AUTHOR_URI);

      await expectRejected(setup({ isBlockedUri }), [0], 'PollAuthorBlockedError');
    });

    it('個別にブロックした相手の投票なら PollAuthorBlockedError を返す', async () => {
      const t = setup({ blockedActor: true });

      await expectRejected(t, [0], 'PollAuthorBlockedError');
      expect(t.deps.blockedActorUriResolverByUsername.resolve).toHaveBeenCalledWith({
        username: t.user.username,
        actorUri: AUTHOR_URI,
      });
    });

    it('ブロックの判定が失敗したら、ブロック済みとして拒否する', async () => {
      const t = setup();
      t.deps.blockedActorUriResolverByUsername.resolve.mockImplementation(() => {
        throw new Error('d1 failure');
      });
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await expectRejected(t, [0], 'PollAuthorBlockedError');
    });

    it('相手のサーバーから Question を取得できなければ RemoteNoteLookupError を返し、保存も送信もしない', async () => {
      await expectRejected(setup({ lookup: null }), [0], 'RemoteNoteLookupError');
    });

    it('取得したオブジェクトが Question でなければ RemoteNoteLookupError を返す', async () => {
      const note = new Note({ id: new URL(QUESTION_URI), content: 'n' });

      await expectRejected(setup({ lookup: note }), [0], 'RemoteNoteLookupError');
    });

    it('作者の inbox が分からなければ RemoteNoteLookupError を返す', async () => {
      const question = new Question({
        id: new URL(QUESTION_URI),
        attribution: new Person({ id: new URL(AUTHOR_URI) }),
      });

      await expectRejected(setup({ lookup: question }), [0], 'RemoteNoteLookupError');
    });

    it('作者を保存していなければ RemoteNoteLookupError を返す', async () => {
      const t = setup();
      t.deps.actorResolverById.resolve.mockReturnValue(RA.ok(undefined as never));

      await expectRejected(t, [0], 'RemoteNoteLookupError');
    });
  });

  describe('成功', () => {
    it('選択肢を 1 つ選ぶと、投票の記録を保存し、作者の inbox へ Create を 1 通送る', async () => {
      const t = setup();

      const result = await t.run([1]);

      expect(result.ok).toBe(true);
      expect(t.deps.remotePostPollVotedStore.store).toHaveBeenCalledOnce();
      const [event] = t.deps.remotePostPollVotedStore.store.mock.calls[0] as unknown as [
        { eventName: string; aggregateState: unknown },
      ];
      expect(event).toMatchObject({
        eventName: 'remotePostPollVote.voted',
        aggregateState: { postId: t.postId, actorId: t.actor.id, choices: [1] },
      });
      expect(t.sent()).toHaveLength(1);
      expect(t.sent()[0]).toMatchObject({ sender: { username: 'kosui' }, recipient: t.authorPerson });
    });

    it('送る Activity は、作者だけ宛ての Create で包んだ、name が選択肢の title の Note にする', async () => {
      const t = setup();

      await t.run([1]);

      const { activity } = t.sent()[0]!;
      expect(activity).toBeInstanceOf(Create);
      expect(activity.actorId?.href).toBe('https://example.com/users/kosui');
      expect(activity.toIds.map((id) => id.href)).toEqual([AUTHOR_URI]);
      expect(activity.ccIds).toEqual([]);
      const note = await activity.getObject();
      expect(note).toBeInstanceOf(Note);
      if (!(note instanceof Note)) return;
      expect(note.id?.href).toMatch(/^https:\/\/example\.com\/users\/kosui\/posts\/[0-9a-f-]{36}$/);
      expect(activity.id?.href).toBe(`${note.id?.href}#activity`);
      expect(note.name?.toString()).toBe('青');
      expect(note.replyTargetId?.href).toBe(QUESTION_URI);
      expect(note.attributionIds.map((id) => id.href)).toEqual(['https://example.com/users/kosui']);
      expect(note.toIds.map((id) => id.href)).toEqual([AUTHOR_URI]);
      expect(note.ccIds).toEqual([]);
      expect(note.content).toBeNull();
      expect(await activity.toJsonLd({ format: 'compact' })).toMatchObject({
        type: 'Create',
        actor: 'https://example.com/users/kosui',
        to: AUTHOR_URI,
        object: {
          type: 'Note',
          name: '青',
          inReplyTo: QUESTION_URI,
          attributedTo: 'https://example.com/users/kosui',
          to: AUTHOR_URI,
        },
      });
    });

    it('複数選択の投票では、選んだ選択肢の数だけ、別々の id の Create を送る', async () => {
      const t = setup({ poll: poll({ multiple: true }) });

      const result = await t.run([2, 0]);

      expect(result.ok).toBe(true);
      expect(t.sent()).toHaveLength(2);
      const notes = await Promise.all(t.sent().map(({ activity }) => activity.getObject()));
      expect(notes.map((note) => (note as Note).name?.toString())).toEqual(['赤', '緑']);
      expect(new Set(t.sent().map(({ activity }) => activity.id?.href)).size).toBe(2);
      expect(new Set(notes.map((note) => note?.id?.href)).size).toBe(2);
      for (const { activity } of t.sent()) expect(activity.toIds.map((id) => id.href)).toEqual([AUTHOR_URI]);
      const [event] = t.deps.remotePostPollVotedStore.store.mock.calls[0] as unknown as [
        { aggregateState: { choices: number[] } },
      ];
      expect(event.aggregateState.choices).toEqual([0, 2]);
    });

    it('公開やフォロワー宛てには送らない', async () => {
      const t = setup();

      await t.run([0]);

      expect(t.ctx.sendActivity).toHaveBeenCalledTimes(1);
      const recipients = vi.mocked(t.ctx.sendActivity).mock.calls.map((call) => call[1]);
      expect(recipients).not.toContain('followers');
    });
  });
});
