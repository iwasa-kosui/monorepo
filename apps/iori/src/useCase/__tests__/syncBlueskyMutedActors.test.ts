import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createBlueskyMutedActorsFetcher } from '../../adaptor/bluesky/blueskyMutedActorsFetcher.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyMutedActorsSyncedStore } from '../../adaptor/d1/blueskyTimeline/blueskyMutedActorsSyncedStore.ts';
import type { BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { SyncBlueskyMutedActorsUseCase } from '../syncBlueskyMutedActors.ts';

type Responses = Readonly<Record<string, ReadonlyArray<Readonly<Record<string, unknown>> | BlueskyClientError>>>;

const fakeClient = (responses: Responses) => {
  const calls: Array<Readonly<{ nsid: string; params: Readonly<Record<string, string>> }>> = [];
  const served = new Map<string, number>();
  const client: BlueskyQueryClient = {
    query: async (nsid, params) => {
      calls.push({ nsid, params });
      const key = nsid === 'app.bsky.graph.getList' ? `${nsid} ${params['list']}` : nsid;
      const index = served.get(key) ?? 0;
      served.set(key, index + 1);
      const response = responses[key]?.[index];
      if (response === undefined) throw new Error(`unexpected query: ${key} #${index}`);
      return 'type' in response && response['type'] === 'BlueskyClientError'
        ? RA.err(response as BlueskyClientError)
        : RA.ok(response as Readonly<Record<string, unknown>>);
    },
  };
  return { client, calls };
};

const setup = (responses: Responses, initial: readonly string[] = []) => {
  const { db, sqlite } = createSqliteD1Fixture();
  const insert = sqlite.prepare('INSERT INTO bluesky_muted_actors(did) VALUES (?)');
  for (const did of initial) insert.run(did);
  const { client, calls } = fakeClient(responses);
  const useCase = SyncBlueskyMutedActorsUseCase.create({
    fetcher: createBlueskyMutedActorsFetcher({ client }),
    syncedStore: createD1BlueskyMutedActorsSyncedStore(db),
  });
  return {
    calls,
    run: () => useCase.run(),
    stored: () =>
      (sqlite.prepare('SELECT did FROM bluesky_muted_actors ORDER BY did').all() as Array<{ did: string }>).map((
        row,
      ) => row.did),
  };
};

const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'app.bsky.graph.getListMutes failed: status 500',
  status: 500,
};

describe('SyncBlueskyMutedActorsUseCase', () => {
  it('直接ミュートしたアカウントと、ミュートしたリストのメンバーを、ページをたどって保存する', async () => {
    const t = setup({
      'app.bsky.graph.getMutes': [
        { mutes: [{ did: 'did:plc:a', handle: 'a.test' }], cursor: 'm1' },
        { mutes: [{ did: 'did:plc:b', handle: 'b.test' }] },
      ],
      'app.bsky.graph.getListMutes': [{ lists: [{ uri: 'at://did:plc:me/app.bsky.graph.list/l1' }] }],
      'app.bsky.graph.getList at://did:plc:me/app.bsky.graph.list/l1': [
        { list: {}, items: [{ uri: 'at://item1', subject: { did: 'did:plc:c' } }], cursor: 'l1' },
        { list: {}, items: [{ uri: 'at://item2', subject: { did: 'did:plc:a' } }] },
      ],
    });

    const result = await t.run();

    expect(result).toEqual({ ok: true, val: { muted: 3, added: 3, removed: 0 } });
    expect(t.stored()).toEqual(['did:plc:a', 'did:plc:b', 'did:plc:c']);
    expect(t.calls[1]).toEqual({ nsid: 'app.bsky.graph.getMutes', params: { limit: '100', cursor: 'm1' } });
  });

  it('ミュートを解除したアカウントは一覧から消す', async () => {
    const t = setup({
      'app.bsky.graph.getMutes': [{ mutes: [{ did: 'did:plc:b' }] }],
      'app.bsky.graph.getListMutes': [{ lists: [] }],
    }, ['did:plc:a', 'did:plc:b']);

    expect(await t.run()).toEqual({ ok: true, val: { muted: 1, added: 0, removed: 1 } });
    expect(t.stored()).toEqual(['did:plc:b']);
  });

  it('取得に失敗したら、前回の一覧を残して失敗を返す', async () => {
    const t = setup({
      'app.bsky.graph.getMutes': [{ mutes: [] }],
      'app.bsky.graph.getListMutes': [failure],
    }, ['did:plc:a']);

    expect(await t.run()).toEqual({ ok: false, err: failure });
    expect(t.stored()).toEqual(['did:plc:a']);
  });

  it('想定外の応答は invalid_response として失敗し、前回の一覧を残す', async () => {
    const t = setup({ 'app.bsky.graph.getMutes': [{ mutes: [{ handle: 'no-did' }] }] }, ['did:plc:a']);

    const result = await t.run();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.err.kind).toBe('invalid_response');
    expect(t.stored()).toEqual(['did:plc:a']);
  });

  it('ページの上限を超えて続くときは、一部だけで同期せずに失敗する', async () => {
    const pages = Array.from({ length: 20 }, (_, index) => ({
      mutes: [{ did: `did:plc:${index}` }],
      cursor: `c${index}`,
    }));
    const t = setup({ 'app.bsky.graph.getMutes': pages }, ['did:plc:a']);

    const result = await t.run();

    expect(result.ok).toBe(false);
    expect(t.stored()).toEqual(['did:plc:a']);
  });
});
