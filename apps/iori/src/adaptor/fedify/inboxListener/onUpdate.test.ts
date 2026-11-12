import { Collection, Image, Mention, Note, Person, Question, Update } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it, vi } from 'vitest';

import {
  RemotePostUpdateAuthorMismatchError,
  type UpdateRemotePostUseCase,
} from '../../../useCase/updateRemotePost.ts';
import type { UpdateRemotePostPollUseCase } from '../../../useCase/updateRemotePostPoll.ts';
import { createOnUpdate } from './onUpdate.ts';

const origin = 'https://iori.test';
const kosuiId = new URL('https://iori.test/users/kosui');
const actorId = new URL('https://remote.example/users/alice');
const noteId = new URL('https://remote.example/notes/1');

const createCtx = () =>
  ({
    recipient: null,
    getDocumentLoader: vi.fn(async () => vi.fn()),
  }) as never;

const setup = (result: unknown = RA.ok({ type: 'updated' })) => {
  const run = vi.fn<UpdateRemotePostUseCase['run']>(async () => result as never);
  const pollRun = vi.fn<UpdateRemotePostPollUseCase['run']>(async () => RA.ok({ type: 'postNotFound' }) as never);
  const listener = createOnUpdate({
    origin,
    updateRemotePostUseCase: { run },
    updateRemotePostPollUseCase: { run: pollRun },
  });
  return { run, pollRun, listener };
};

const followersId = new URL('https://remote.example/users/alice/followers');

const updateOf = (object: unknown, actor: URL | null = actorId) =>
  ({
    actorId: actor,
    getObject: vi.fn(async () => object),
    getActor: vi.fn(async () => ({ followersId })),
    toIds: [],
    ccIds: [],
    btoIds: [],
    bccIds: [],
    audienceIds: [],
  }) as unknown as Update;

const noteOf = (overrides: Partial<ConstructorParameters<typeof Note>[0]> = {}) =>
  new Note({
    id: noteId,
    attribution: actorId,
    content: '<p>after</p>',
    summary: 'cw',
    sensitive: true,
    updated: Temporal.Instant.fromEpochMilliseconds(5_000),
    tos: [kosuiId],
    attachments: [new Image({ url: new URL('https://remote.example/media/a.png'), name: 'alt' })],
    ...overrides,
  });

describe('createOnUpdate', () => {
  it('Note の Update から本文、CW、センシティブ、添付、宛先、編集時刻を取り出して更新する', async () => {
    const { run, listener } = setup();

    await listener(createCtx(), updateOf(noteOf()));

    expect(run).toHaveBeenCalledExactlyOnceWith({
      uri: noteId.href,
      actorUri: actorId.href,
      content: '<p>after</p>',
      summary: 'cw',
      sensitive: true,
      attachments: [{ url: 'https://remote.example/media/a.png', altText: 'alt', mediaType: null }],
      recipientActorUris: [kosuiId.href],
      mentionedActorUris: [],
      visibility: 'direct',
      editedAt: 5_000,
    });
  });

  it('Question の Update から、本文と更新後の票数・締め切り・closed を取り出して渡す', async () => {
    const { run, listener } = setup();
    const question = new Question({
      id: noteId,
      attribution: actorId,
      content: '<p>q</p>',
      updated: Temporal.Instant.fromEpochMilliseconds(5_000),
      endTime: Temporal.Instant.fromEpochMilliseconds(6_000),
      closed: Temporal.Instant.fromEpochMilliseconds(6_000),
      tos: [kosuiId],
      exclusiveOptions: [
        new Note({ name: 'a', replies: new Collection({ totalItems: 10 }) }),
        new Note({ name: 'b', replies: new Collection({ totalItems: 6 }) }),
      ],
      voters: 16,
    });

    await listener(createCtx(), updateOf(question));

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      content: `<p>q</p><p><a href="${noteId.href}">元の投稿で投票する</a></p>`,
      poll: {
        multiple: false,
        options: [{ title: 'a', votesCount: 10 }, { title: 'b', votesCount: 6 }],
        votersCount: 16,
        expiresAt: 6_000,
        closed: true,
      },
    });
  });

  it('updated が無い Question の Update は、投票だけを更新し、編集としては扱わない', async () => {
    const { run, pollRun, listener } = setup();
    const question = new Question({
      id: noteId,
      attribution: actorId,
      content: '<p>q</p>',
      endTime: Temporal.Instant.fromEpochMilliseconds(6_000),
      tos: [kosuiId],
      exclusiveOptions: [
        new Note({ name: 'a', replies: new Collection({ totalItems: 11 }) }),
        new Note({ name: 'b', replies: new Collection({ totalItems: 6 }) }),
      ],
      voters: 17,
    });

    await listener(createCtx(), updateOf(question));

    expect(run).not.toHaveBeenCalled();
    expect(pollRun).toHaveBeenCalledExactlyOnceWith({
      uri: noteId.href,
      actorUri: actorId.href,
      poll: {
        multiple: false,
        options: [{ title: 'a', votesCount: 11 }, { title: 'b', votesCount: 6 }],
        votersCount: 17,
        expiresAt: 6_000,
        closed: true,
      },
    });
  });

  it('updated がある Question の Update は、これまでどおり編集として扱う', async () => {
    const { run, pollRun, listener } = setup();
    const question = new Question({
      id: noteId,
      attribution: actorId,
      content: '<p>q</p>',
      updated: Temporal.Instant.fromEpochMilliseconds(5_000),
      tos: [kosuiId],
      exclusiveOptions: [new Note({ name: 'a', replies: new Collection({ totalItems: 1 }) })],
    });

    await listener(createCtx(), updateOf(question));

    expect(pollRun).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toMatchObject({ editedAt: 5_000 });
  });

  it('updated が無くても、Note の Update は投票だけの更新にしない', async () => {
    const { run, pollRun, listener } = setup();

    await listener(createCtx(), updateOf(noteOf({ updated: null })));

    expect(pollRun).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledOnce();
  });

  it('updated が無い Question に読める選択肢が無ければ、何も更新しない', async () => {
    const { run, pollRun, listener } = setup();

    await listener(createCtx(), updateOf(new Question({ id: noteId, attribution: actorId, content: '<p>q</p>' })));

    expect(run).not.toHaveBeenCalled();
    expect(pollRun).not.toHaveBeenCalled();
  });

  it('updated が無い Question の作者が違うと判定されても例外にしない', async () => {
    const { pollRun, listener } = setup();
    pollRun.mockResolvedValue(
      RA.err(RemotePostUpdateAuthorMismatchError.create({ uri: noteId.href, actorUri: actorId.href })) as never,
    );
    const question = new Question({
      id: noteId,
      attribution: actorId,
      exclusiveOptions: [new Note({ name: 'a' })],
    });

    await expect(listener(createCtx(), updateOf(question))).resolves.toBeUndefined();
    expect(pollRun).toHaveBeenCalledOnce();
  });

  it('Note の Update には poll を渡さない', async () => {
    const { run, listener } = setup();

    await listener(createCtx(), updateOf(noteOf()));

    expect(run.mock.calls[0]?.[0]).not.toHaveProperty('poll');
  });

  it('Note のメンションのタグから、メンションされた actor の URI を取り出して渡す', async () => {
    const { run, listener } = setup();
    const bobId = new URL('https://other.example/users/bob');

    await listener(createCtx(), updateOf(noteOf({ tags: [new Mention({ href: bobId, name: '@bob@other.example' })] })));

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toMatchObject({ mentionedActorUris: [bobId.href] });
  });

  it('Note の宛先から公開範囲を求める', async () => {
    const { run, listener } = setup();
    const publicId = new URL('https://www.w3.org/ns/activitystreams#Public');

    await listener(createCtx(), updateOf(noteOf({ tos: [publicId] })));
    await listener(createCtx(), updateOf(noteOf({ tos: [followersId] })));
    await listener(createCtx(), updateOf(noteOf({ tos: [], ccs: [] })));

    expect(run.mock.calls.map(([input]) => input.visibility)).toEqual(['public', 'private', null]);
  });

  it('actor を取得できなければ公開範囲を不明として渡す', async () => {
    const { run, listener } = setup();
    const update = updateOf(noteOf());
    (update as unknown as { getActor: unknown }).getActor = vi.fn(async () => {
      throw new Error('fetch failed');
    });

    await listener(createCtx(), update);

    expect(run.mock.calls[0][0].visibility).toBeNull();
  });

  it('updated がなければ受信時刻を編集時刻にする', async () => {
    const { run, listener } = setup();
    const before = Date.now();

    await listener(createCtx(), updateOf(noteOf({ updated: null })));

    const editedAt = run.mock.calls[0][0].editedAt;
    expect(editedAt).toBeGreaterThanOrEqual(before);
    expect(editedAt).toBeLessThanOrEqual(Date.now());
  });

  it('Note でない object の Update は処理しない', async () => {
    const { run, listener } = setup();

    await listener(createCtx(), updateOf(new Person({ id: actorId })));

    expect(run).not.toHaveBeenCalled();
  });

  it('actor と attributedTo が一致しなければ処理しない', async () => {
    const { run, listener } = setup();

    await listener(
      createCtx(),
      updateOf(noteOf({ attribution: new URL('https://remote.example/users/mallory') })),
    );
    await listener(createCtx(), updateOf(noteOf({ attribution: undefined })));

    expect(run).not.toHaveBeenCalled();
  });

  it('object の id のオリジンが actor のオリジンと違えば処理しない', async () => {
    const { run, listener } = setup();

    await listener(createCtx(), updateOf(noteOf({ id: new URL('https://evil.example/notes/1') })));

    expect(run).not.toHaveBeenCalled();
  });

  it('actor がない Update は処理しない', async () => {
    const { run, listener } = setup();

    await listener(createCtx(), updateOf(noteOf(), null));

    expect(run).not.toHaveBeenCalled();
  });

  it('保存済みの投稿の作者が違うと判定されても例外にしない', async () => {
    const { run, listener } = setup(
      RA.err(RemotePostUpdateAuthorMismatchError.create({ uri: noteId.href, actorUri: actorId.href })),
    );

    await expect(listener(createCtx(), updateOf(noteOf()))).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledOnce();
  });
});
