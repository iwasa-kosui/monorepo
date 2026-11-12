import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyModeratedActorsResolver } from '../../adaptor/d1/blueskyModeration/blueskyModeratedActorsResolver.ts';
import {
  createD1BlueskyBlockDeletedStore,
  createD1BlueskyBlockSavedStore,
  createD1BlueskyMuteDeletedStore,
  createD1BlueskyMuteSavedStore,
} from '../../adaptor/d1/blueskyModeration/blueskyModeratedActorsStore.ts';
import {
  BLUESKY_MODERATION_SYNC_GRACE_MS,
  BLUESKY_REPORT_COMMENT_MAX_LENGTH,
} from '../../domain/blueskyModeration/blueskyModeration.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyModerationReader } from '../../ports/blueskyModerationReader.ts';
import { BlockBlueskyActorUseCase } from '../blockBlueskyActor.ts';
import { GetBlueskyModerationStateUseCase } from '../getBlueskyModerationState.ts';
import { MuteBlueskyActorUseCase } from '../muteBlueskyActor.ts';
import { MuteBlueskyThreadUseCase } from '../muteBlueskyThread.ts';
import { ReportBlueskyActorUseCase } from '../reportBlueskyActor.ts';
import { UnblockBlueskyActorUseCase } from '../unblockBlueskyActor.ts';
import { UnmuteBlueskyActorUseCase } from '../unmuteBlueskyActor.ts';
import { UnmuteBlueskyThreadUseCase } from '../unmuteBlueskyThread.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 12));
const DID = 'did:plc:target';
const ROOT = 'at://did:plc:target/app.bsky.feed.post/3kroot';
const OLD_BLOCK = 'at://did:plc:me/app.bsky.graph.block/3kold';
const NEW_BLOCK = 'at://did:plc:me/app.bsky.graph.block/3knew';
const STORED_BLOCK = 'at://did:plc:me/app.bsky.graph.block/3kstored';
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'request failed: status 500',
  status: 500,
};

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = (viewer: Readonly<{ muted?: boolean; blockUri?: string | null; hasRecord?: boolean }> = {}) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db, sqlite } = fixture;
  const client = {
    muteActor: vi.fn<BlueskyClient['muteActor']>(async () => RA.ok(undefined)),
    unmuteActor: vi.fn<BlueskyClient['unmuteActor']>(async () => RA.ok(undefined)),
    muteThread: vi.fn<BlueskyClient['muteThread']>(async () => RA.ok(undefined)),
    unmuteThread: vi.fn<BlueskyClient['unmuteThread']>(async () => RA.ok(undefined)),
    createBlock: vi.fn<BlueskyClient['createBlock']>(async () => RA.ok({ uri: NEW_BLOCK })),
    deleteBlock: vi.fn<BlueskyClient['deleteBlock']>(async () => RA.ok(undefined)),
    createReport: vi.fn<BlueskyClient['createReport']>(async () => RA.ok(undefined)),
  };
  const reader = {
    resolveViewerState: vi.fn<BlueskyModerationReader['resolveViewerState']>(async () =>
      RA.ok({ muted: viewer.muted ?? false, blockUri: viewer.blockUri ?? null })
    ),
    hasBlockRecord: vi.fn<BlueskyModerationReader['hasBlockRecord']>(async () => RA.ok(viewer.hasRecord ?? true)),
  };
  const resolver = createD1BlueskyModeratedActorsResolver(db);
  const now = () => NOW;
  return {
    client,
    reader,
    mute: MuteBlueskyActorUseCase.create({ client, savedStore: createD1BlueskyMuteSavedStore(db), now }),
    unmute: UnmuteBlueskyActorUseCase.create({ client, deletedStore: createD1BlueskyMuteDeletedStore(db), now }),
    muteThread: MuteBlueskyThreadUseCase.create({ client }),
    unmuteThread: UnmuteBlueskyThreadUseCase.create({ client }),
    block: BlockBlueskyActorUseCase.create({
      client,
      reader,
      resolver,
      savedStore: createD1BlueskyBlockSavedStore(db),
      now,
    }),
    unblock: UnblockBlueskyActorUseCase.create({
      client,
      reader,
      resolver,
      deletedStore: createD1BlueskyBlockDeletedStore(db),
      now,
    }),
    report: ReportBlueskyActorUseCase.create({ client }),
    getState: GetBlueskyModerationStateUseCase.create({
      reader,
      resolver,
      muteSavedStore: createD1BlueskyMuteSavedStore(db),
      muteDeletedStore: createD1BlueskyMuteDeletedStore(db),
      blockSavedStore: createD1BlueskyBlockSavedStore(db),
      blockDeletedStore: createD1BlueskyBlockDeletedStore(db),
      now,
    }),
    sqlite,
    rows: () => sqlite.prepare('SELECT did, muted, blockUri FROM bluesky_moderated_actors').all(),
    seed: (muted: number, blockUri: string | null, updatedAt = 1) =>
      sqlite.prepare('INSERT INTO bluesky_moderated_actors(did,muted,blockUri,updatedAt) VALUES (?,?,?,?)')
        .run(DID, muted, blockUri, updatedAt),
    state: async () => (await resolver.resolveState(DID)).val,
  };
};

describe('MuteBlueskyActorUseCase と UnmuteBlueskyActorUseCase', () => {
  it('mute は Bluesky のミュートを呼んでから D1 に保存する', async () => {
    const t = setup();

    const result = await t.mute.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { muted: true } });
    expect(t.client.muteActor).toHaveBeenCalledExactlyOnceWith(DID);
    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: null }]);
  });

  it('mute は Bluesky が失敗したら D1 に保存しない', async () => {
    const t = setup();
    t.client.muteActor.mockReturnValueOnce(RA.err(failure));

    const result = await t.mute.run({ did: DID });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.rows()).toEqual([]);
  });

  it('unmute は Bluesky のミュート解除を呼んでから D1 の行を解除し、ブロックは残す', async () => {
    const t = setup();
    t.seed(1, OLD_BLOCK);

    const result = await t.unmute.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { muted: false } });
    expect(t.client.unmuteActor).toHaveBeenCalledExactlyOnceWith(DID);
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: OLD_BLOCK }]);
  });

  it('unmute は Bluesky が失敗したら D1 を変えない', async () => {
    const t = setup();
    t.seed(1, null);
    t.client.unmuteActor.mockReturnValueOnce(RA.err(failure));

    expect(await t.unmute.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: null }]);
  });
});

describe('MuteBlueskyThreadUseCase と UnmuteBlueskyThreadUseCase', () => {
  it('muteThread は Bluesky のスレッドのミュートを呼び、D1 に保存しない', async () => {
    const t = setup();

    const result = await t.muteThread.run({ root: ROOT });

    expect(result).toEqual({ ok: true, val: { threadMuted: true } });
    expect(t.client.muteThread).toHaveBeenCalledExactlyOnceWith(ROOT);
    expect(t.rows()).toEqual([]);
  });

  it('muteThread は Bluesky が失敗したらその失敗を返す', async () => {
    const t = setup();
    t.client.muteThread.mockReturnValueOnce(RA.err(failure));

    expect(await t.muteThread.run({ root: ROOT })).toEqual({ ok: false, err: failure });
    expect(t.rows()).toEqual([]);
  });

  it('unmuteThread は Bluesky のスレッドのミュートの解除を呼び、D1 に書かない', async () => {
    const t = setup();

    const result = await t.unmuteThread.run({ root: ROOT });

    expect(result).toEqual({ ok: true, val: { threadMuted: false } });
    expect(t.client.unmuteThread).toHaveBeenCalledExactlyOnceWith(ROOT);
    expect(t.rows()).toEqual([]);
  });

  it('unmuteThread は Bluesky が失敗したらその失敗を返す', async () => {
    const t = setup();
    t.client.unmuteThread.mockReturnValueOnce(RA.err(failure));

    expect(await t.unmuteThread.run({ root: ROOT })).toEqual({ ok: false, err: failure });
    expect(t.rows()).toEqual([]);
  });
});

describe('BlockBlueskyActorUseCase', () => {
  it('ブロックしていなければ createBlock を呼び、返った uri を D1 に保存する', async () => {
    const t = setup();

    const result = await t.block.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: NEW_BLOCK } });
    expect(t.reader.resolveViewerState).toHaveBeenCalledExactlyOnceWith(DID);
    expect(t.client.createBlock).toHaveBeenCalledExactlyOnceWith(DID);
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: NEW_BLOCK }]);
  });

  it('既にブロック済みで自分の repo にレコードがあれば、createBlock を呼ばずその uri を返して保存する', async () => {
    const t = setup({ blockUri: OLD_BLOCK, hasRecord: true });

    const result = await t.block.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: OLD_BLOCK } });
    expect(t.reader.hasBlockRecord).toHaveBeenCalledExactlyOnceWith(OLD_BLOCK);
    expect(t.client.createBlock).not.toHaveBeenCalled();
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: OLD_BLOCK }]);
  });

  it('AppView の反映が遅れて viewer.blocking が無くても、D1 に blockUri があれば createBlock を呼ばずその uri を返す', async () => {
    const t = setup({ blockUri: null, hasRecord: true });
    t.seed(0, STORED_BLOCK);

    const result = await t.block.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: STORED_BLOCK } });
    expect(t.reader.hasBlockRecord).toHaveBeenCalledExactlyOnceWith(STORED_BLOCK);
    expect(t.client.createBlock).not.toHaveBeenCalled();
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: STORED_BLOCK }]);
  });

  it('D1 の blockUri のレコードが無くても viewer.blocking のレコードがあれば、その uri を返す', async () => {
    const t = setup({ blockUri: OLD_BLOCK });
    t.reader.hasBlockRecord.mockImplementation(async (uri) => RA.ok(uri === OLD_BLOCK));
    t.seed(0, STORED_BLOCK);

    const result = await t.block.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: OLD_BLOCK } });
    expect(t.reader.hasBlockRecord.mock.calls.map(([uri]) => uri)).toEqual([STORED_BLOCK, OLD_BLOCK]);
    expect(t.client.createBlock).not.toHaveBeenCalled();
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: OLD_BLOCK }]);
  });

  it('D1 と viewer.blocking が同じ uri なら、一度だけ確かめる', async () => {
    const t = setup({ blockUri: OLD_BLOCK });
    t.seed(0, OLD_BLOCK);

    await t.block.run({ did: DID });

    expect(t.reader.hasBlockRecord).toHaveBeenCalledExactlyOnceWith(OLD_BLOCK);
  });

  it('候補のレコードがどれも自分の repo に無ければ、createBlock で作る', async () => {
    const t = setup({ blockUri: OLD_BLOCK, hasRecord: false });
    t.seed(0, STORED_BLOCK);

    const result = await t.block.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: NEW_BLOCK } });
    expect(t.reader.hasBlockRecord).toHaveBeenCalledTimes(2);
    expect(t.client.createBlock).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('viewer.blocking のレコードが自分の repo に無ければ、createBlock で作る', async () => {
    const t = setup({ blockUri: OLD_BLOCK, hasRecord: false });

    const result = await t.block.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: NEW_BLOCK } });
    expect(t.client.createBlock).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('viewer.blocking がブロックリストの uri のときは、block の uri が無いものとして createBlock で作る', async () => {
    const t = setup({ blockUri: null });

    const result = await t.block.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: NEW_BLOCK } });
    expect(t.reader.hasBlockRecord).not.toHaveBeenCalled();
  });

  it('getProfile、getRecord、createBlock のどれが失敗しても、その失敗を返し D1 に保存しない', async () => {
    const profile = setup();
    profile.reader.resolveViewerState.mockReturnValueOnce(RA.err(failure));
    const record = setup({ blockUri: OLD_BLOCK });
    record.reader.hasBlockRecord.mockReturnValueOnce(RA.err(failure));
    const create = setup();
    create.client.createBlock.mockReturnValueOnce(RA.err(failure));

    expect(await profile.block.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(await record.block.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(await create.block.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(profile.rows()).toEqual([]);
    expect(record.rows()).toEqual([]);
    expect(create.rows()).toEqual([]);
  });

  it('ミュート中の相手をブロックしても、ミュートを残す', async () => {
    const t = setup();
    t.seed(1, null);

    await t.block.run({ did: DID });

    expect(await t.state()).toEqual({ muted: true, blockUri: NEW_BLOCK });
  });
});

describe('UnblockBlueskyActorUseCase', () => {
  it('blockUri が渡されたら、その uri を削除し、D1 のブロックを解除する', async () => {
    const t = setup({ blockUri: null });
    t.seed(0, OLD_BLOCK);

    const result = await t.unblock.run({ did: DID, blockUri: OLD_BLOCK });

    expect(result).toEqual({ ok: true, val: { blockUri: null } });
    expect(t.client.deleteBlock).toHaveBeenCalledExactlyOnceWith(OLD_BLOCK);
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: null }]);
  });

  it('blockUri が無ければ、getProfile の viewer.blocking を削除する', async () => {
    const t = setup({ blockUri: OLD_BLOCK });
    t.seed(1, OLD_BLOCK);

    const result = await t.unblock.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: null } });
    expect(t.client.deleteBlock).toHaveBeenCalledExactlyOnceWith(OLD_BLOCK);
    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: null }]);
  });

  it('blockUri、viewer.blocking、D1 の blockUri が違うときは、重複を除いた全件を削除する', async () => {
    const t = setup({ blockUri: NEW_BLOCK });
    t.seed(0, STORED_BLOCK);

    const result = await t.unblock.run({ did: DID, blockUri: OLD_BLOCK });

    expect(result).toEqual({ ok: true, val: { blockUri: null } });
    expect(t.client.deleteBlock.mock.calls.map(([uri]) => uri)).toEqual([OLD_BLOCK, NEW_BLOCK, STORED_BLOCK]);
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: null }]);
  });

  it('同じ uri は一度だけ削除する', async () => {
    const t = setup({ blockUri: OLD_BLOCK });
    t.seed(0, OLD_BLOCK);

    await t.unblock.run({ did: DID, blockUri: OLD_BLOCK });

    expect(t.client.deleteBlock).toHaveBeenCalledExactlyOnceWith(OLD_BLOCK);
  });

  it('AppView の反映が遅れて viewer.blocking が無くても、D1 の blockUri を削除する', async () => {
    const t = setup({ blockUri: null });
    t.seed(0, STORED_BLOCK);

    await t.unblock.run({ did: DID });

    expect(t.client.deleteBlock).toHaveBeenCalledExactlyOnceWith(STORED_BLOCK);
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: null }]);
  });

  it('候補の片方の deleteBlock が失敗したら、その失敗を返し D1 のブロックを残す', async () => {
    const t = setup({ blockUri: NEW_BLOCK });
    t.seed(0, STORED_BLOCK);
    t.client.deleteBlock.mockReturnValueOnce(RA.err(failure));

    const result = await t.unblock.run({ did: DID });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.client.deleteBlock).toHaveBeenCalledTimes(2);
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: STORED_BLOCK }]);
  });

  it('blockUri、viewer.blocking、D1 の blockUri のどれも無ければ、Bluesky を呼ばず D1 だけ解除する', async () => {
    const t = setup({ blockUri: null });
    t.seed(1, null);

    const result = await t.unblock.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { blockUri: null } });
    expect(t.client.deleteBlock).not.toHaveBeenCalled();
    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: null }]);
  });

  it('deleteBlock が失敗したら、その失敗を返し D1 のブロックを残す', async () => {
    const t = setup();
    t.seed(0, OLD_BLOCK);
    t.client.deleteBlock.mockReturnValueOnce(RA.err(failure));

    expect(await t.unblock.run({ did: DID, blockUri: OLD_BLOCK })).toEqual({ ok: false, err: failure });
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: OLD_BLOCK }]);
  });

  it('getProfile が失敗したら、その失敗を返し deleteBlock を呼ばない', async () => {
    const t = setup();
    t.reader.resolveViewerState.mockReturnValueOnce(RA.err(failure));

    expect(await t.unblock.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(t.client.deleteBlock).not.toHaveBeenCalled();
  });
});

describe('ReportBlueskyActorUseCase', () => {
  it.each(
    [
      ['spam', 'com.atproto.moderation.defs#reasonSpam'],
      ['offensive', 'com.atproto.moderation.defs#reasonRude'],
      ['other', 'com.atproto.moderation.defs#reasonOther'],
    ] as const,
  )('category %s を reasonType %s にして通報する', async (category, reasonType) => {
    const t = setup();

    const result = await t.report.run({ did: DID, category, comment: '理由' });

    expect(result).toEqual({ ok: true, val: { reported: true } });
    expect(t.client.createReport).toHaveBeenCalledExactlyOnceWith({
      subjectDid: DID,
      reasonType,
      reason: '理由',
    });
  });

  it('comment は前後の空白を取り除いて渡し、空なら空文字のまま渡す', async () => {
    const t = setup();

    await t.report.run({ did: DID, category: 'spam', comment: '  理由  ' });
    await t.report.run({ did: DID, category: 'spam', comment: '   ' });

    expect(t.client.createReport.mock.calls.map(([input]) => input.reason)).toEqual(['理由', '']);
  });

  it('comment は 2000 文字までを受け、超えたら検証エラーにして Bluesky を呼ばない', async () => {
    const t = setup();

    const ok = await t.report.run({
      did: DID,
      category: 'other',
      comment: 'あ'.repeat(BLUESKY_REPORT_COMMENT_MAX_LENGTH),
    });
    const tooLong = await t.report.run({
      did: DID,
      category: 'other',
      comment: 'あ'.repeat(BLUESKY_REPORT_COMMENT_MAX_LENGTH + 1),
    });

    expect(ok.ok).toBe(true);
    expect(tooLong).toEqual({ ok: false, err: { type: 'BlueskyModerationValidationError', field: 'comment' } });
    expect(t.client.createReport).toHaveBeenCalledTimes(1);
  });

  it('Bluesky が失敗したら、その失敗を返す', async () => {
    const t = setup();
    t.client.createReport.mockReturnValueOnce(RA.err(failure));

    expect(await t.report.run({ did: DID, category: 'spam', comment: '' })).toEqual({ ok: false, err: failure });
  });
});

describe('GetBlueskyModerationStateUseCase', () => {
  it('viewer の状態をそのまま返す', async () => {
    const t = setup({ muted: true, blockUri: OLD_BLOCK });

    expect(await t.getState.run({ did: DID })).toEqual({ ok: true, val: { muted: true, blockUri: OLD_BLOCK } });
    expect(t.reader.resolveViewerState).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('取得に失敗したら、その失敗を返し D1 を変えない', async () => {
    const t = setup();
    t.seed(1, OLD_BLOCK);
    t.reader.resolveViewerState.mockReturnValueOnce(RA.err(failure));

    expect(await t.getState.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: OLD_BLOCK }]);
  });

  it('公式アプリでミュートとブロックが解除されていたら、D1 の行を解除する', async () => {
    const t = setup({ muted: false, blockUri: null });
    t.seed(1, OLD_BLOCK);

    const result = await t.getState.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { muted: false, blockUri: null } });
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: null }]);
  });

  it('公式アプリでミュートとブロックがされていたら、D1 に保存する', async () => {
    const t = setup({ muted: true, blockUri: OLD_BLOCK });

    const result = await t.getState.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { muted: true, blockUri: OLD_BLOCK } });
    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: OLD_BLOCK }]);
  });

  it('ミュートだけ、ブロックだけが食い違うときは、食い違う方だけを D1 に合わせる', async () => {
    const mute = setup({ muted: false, blockUri: OLD_BLOCK });
    mute.seed(1, OLD_BLOCK);
    const block = setup({ muted: true, blockUri: NEW_BLOCK });
    block.seed(1, OLD_BLOCK);

    await mute.getState.run({ did: DID });
    await block.getState.run({ did: DID });

    expect(mute.rows()).toEqual([{ did: DID, muted: 0, blockUri: OLD_BLOCK }]);
    expect(block.rows()).toEqual([{ did: DID, muted: 1, blockUri: NEW_BLOCK }]);
  });

  it('D1 と viewer の状態が一致していれば、D1 に書き込まない', async () => {
    const t = setup({ muted: true, blockUri: OLD_BLOCK });
    t.seed(1, OLD_BLOCK);

    await t.getState.run({ did: DID });

    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: OLD_BLOCK }]);
    expect(t.sqlite.prepare('SELECT updatedAt FROM bluesky_moderated_actors').all()).toEqual([{ updatedAt: 1 }]);
  });

  it('D1 の行の updatedAt が5分以内なら、viewer と食い違っても D1 に書き込まない', async () => {
    const t = setup({ muted: false, blockUri: null });
    t.seed(1, STORED_BLOCK, NOW - BLUESKY_MODERATION_SYNC_GRACE_MS);

    const result = await t.getState.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { muted: false, blockUri: null } });
    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: STORED_BLOCK }]);
  });

  it('D1 の行の updatedAt が5分を過ぎていれば、viewer に合わせる', async () => {
    const t = setup({ muted: false, blockUri: null });
    t.seed(1, STORED_BLOCK, NOW - BLUESKY_MODERATION_SYNC_GRACE_MS - 1);

    await t.getState.run({ did: DID });

    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: null }]);
  });

  it('iori で解除した直後に viewer に古いミュートとブロックが残っていても、保存し直さない', async () => {
    const t = setup({ muted: true, blockUri: OLD_BLOCK });
    t.seed(1, OLD_BLOCK);
    await t.unmute.run({ did: DID });
    await t.unblock.run({ did: DID });

    const result = await t.getState.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { muted: true, blockUri: OLD_BLOCK } });
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: null }]);
  });

  it('解除しても行は残り、updatedAt を解除した時刻に更新する', async () => {
    const t = setup({ blockUri: null });
    t.seed(0, OLD_BLOCK);

    await t.unblock.run({ did: DID });

    expect(t.sqlite.prepare('SELECT updatedAt FROM bluesky_moderated_actors').all()).toEqual([{ updatedAt: NOW }]);
  });

  it('ブロックリスト経由の uri は blockUri として保存しない', async () => {
    const t = setup({ muted: false, blockUri: null });

    const result = await t.getState.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { muted: false, blockUri: null } });
    expect(t.rows()).toEqual([]);
  });

  it('D1 の更新が失敗しても、viewer の状態を返し、失敗を console.error に出す', async () => {
    const t = setup({ muted: true, blockUri: null });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    t.sqlite.exec('DROP TABLE bluesky_moderated_actors');

    const result = await t.getState.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { muted: true, blockUri: null } });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
