import { Image, Note, Person, Update } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it, vi } from 'vitest';

import {
  RemotePostUpdateAuthorMismatchError,
  type UpdateRemotePostUseCase,
} from '../../../useCase/updateRemotePost.ts';
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
  const listener = createOnUpdate({ origin, updateRemotePostUseCase: { run } });
  return { run, listener };
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
      attachments: [{ url: 'https://remote.example/media/a.png', altText: 'alt' }],
      recipientActorUris: [kosuiId.href],
      visibility: 'direct',
      editedAt: 5_000,
    });
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
