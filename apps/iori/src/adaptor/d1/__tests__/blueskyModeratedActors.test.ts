import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { createD1BlueskyModeratedActorsResolver } from '../blueskyModeration/blueskyModeratedActorsResolver.ts';
import {
  createD1BlueskyBlockDeletedStore,
  createD1BlueskyBlockSavedStore,
  createD1BlueskyMuteDeletedStore,
  createD1BlueskyMuteSavedStore,
} from '../blueskyModeration/blueskyModeratedActorsStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const T1 = Instant.orThrow(Date.UTC(2026, 10, 12, 1));
const T2 = Instant.orThrow(Date.UTC(2026, 10, 12, 2));
const T3 = Instant.orThrow(Date.UTC(2026, 10, 12, 3));
const ALICE = 'did:plc:alice';
const BOB = 'did:plc:bob';
const BLOCK = 'at://did:plc:me/app.bsky.graph.block/3kblock';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db, sqlite } = fixture;
  const resolver = createD1BlueskyModeratedActorsResolver(db);
  return {
    sqlite,
    muteSaved: createD1BlueskyMuteSavedStore(db),
    muteDeleted: createD1BlueskyMuteDeletedStore(db),
    blockSaved: createD1BlueskyBlockSavedStore(db),
    blockDeleted: createD1BlueskyBlockDeletedStore(db),
    excluded: async () => [...Result.unsafeUnwrap(await resolver.resolveExcludedDids())].sort(),
    state: async (did: string) => Result.unsafeUnwrap(await resolver.resolveState(did)),
    rows: () =>
      sqlite.prepare('SELECT did, muted, blockUri, updatedAt FROM bluesky_moderated_actors ORDER BY did').all(),
  };
};

describe('D1 の bluesky_moderated_actors', () => {
  it('行が無い DID は、ミュートもブロックもしていない状態にする', async () => {
    const t = setup();

    expect(await t.state(ALICE)).toEqual({ muted: false, blockUri: null });
    expect(await t.excluded()).toEqual([]);
  });

  it('ミュートを保存すると、除外する DID と状態に反映し、もう一度保存しても行を増やさない', async () => {
    const t = setup();

    await t.muteSaved.save(ALICE, T1);
    await t.muteSaved.save(ALICE, T2);

    expect(await t.state(ALICE)).toEqual({ muted: true, blockUri: null });
    expect(await t.excluded()).toEqual([ALICE]);
    expect(t.rows()).toEqual([{ did: ALICE, muted: 1, blockUri: null, updatedAt: T2 }]);
  });

  it('ブロックを保存すると、除外する DID と状態に反映する', async () => {
    const t = setup();

    await t.blockSaved.save(BOB, BLOCK, T1);

    expect(await t.state(BOB)).toEqual({ muted: false, blockUri: BLOCK });
    expect(await t.excluded()).toEqual([BOB]);
  });

  it('ミュートの保存はブロックの列を、ブロックの保存はミュートの列を変えない', async () => {
    const t = setup();

    await t.blockSaved.save(ALICE, BLOCK, T1);
    await t.muteSaved.save(ALICE, T2);
    expect(t.rows()).toEqual([{ did: ALICE, muted: 1, blockUri: BLOCK, updatedAt: T2 }]);

    await t.muteDeleted.delete(ALICE, T3);
    await t.muteSaved.save(ALICE, T1);
    await t.blockSaved.save(ALICE, `${BLOCK}2`, T3);
    expect(t.rows()).toEqual([{ did: ALICE, muted: 1, blockUri: `${BLOCK}2`, updatedAt: T3 }]);
  });

  it('ミュートの解除はブロックを残し、ブロックの解除はミュートを残す', async () => {
    const t = setup();
    await t.muteSaved.save(ALICE, T1);
    await t.blockSaved.save(ALICE, BLOCK, T1);

    await t.muteDeleted.delete(ALICE, T2);
    expect(await t.state(ALICE)).toEqual({ muted: false, blockUri: BLOCK });
    expect(await t.excluded()).toEqual([ALICE]);

    await t.muteSaved.save(ALICE, T2);
    await t.blockDeleted.delete(ALICE, T3);
    expect(await t.state(ALICE)).toEqual({ muted: true, blockUri: null });
    expect(await t.excluded()).toEqual([ALICE]);
  });

  it('ミュートもブロックも無くなった行は消し、他の DID の行は残す', async () => {
    const t = setup();
    await t.muteSaved.save(ALICE, T1);
    await t.blockSaved.save(ALICE, BLOCK, T1);
    await t.muteSaved.save(BOB, T1);

    await t.muteDeleted.delete(ALICE, T2);
    await t.blockDeleted.delete(ALICE, T3);

    expect(t.rows()).toEqual([{ did: BOB, muted: 1, blockUri: null, updatedAt: T1 }]);
    expect(await t.excluded()).toEqual([BOB]);
  });

  it('行が無い DID の解除は何もしない', async () => {
    const t = setup();

    await t.muteDeleted.delete(ALICE, T1);
    await t.blockDeleted.delete(ALICE, T1);

    expect(t.rows()).toEqual([]);
  });

  it('muted が 0 で blockUri が NULL の行は、除外する DID に含めない', async () => {
    const t = setup();
    t.sqlite.prepare('INSERT INTO bluesky_moderated_actors(did,muted,blockUri,updatedAt) VALUES (?,?,?,?)')
      .run(ALICE, 0, null, T1);

    expect(await t.excluded()).toEqual([]);
    expect(await t.state(ALICE)).toEqual({ muted: false, blockUri: null });
  });
});
