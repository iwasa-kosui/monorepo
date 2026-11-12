import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyModerationReader } from './blueskyModerationReader.ts';

const DID = 'did:plc:target';
const BLOCK = 'at://did:plc:me/app.bsky.graph.block/3kblock';
const LIST = 'at://did:plc:other/app.bsky.graph.list/3klist';
const clientReturning = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn(() => response);
  return { query, reader: createBlueskyModerationReader({ client: { query } }) };
};
const failure = (overrides: Partial<BlueskyClientError> = {}): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'failed',
  ...overrides,
});

describe('createBlueskyModerationReader の resolveViewerState', () => {
  it('getProfile を対象の DID で呼ぶ', async () => {
    const { query, reader } = clientReturning(RA.ok({ did: DID }));

    await reader.resolveViewerState(DID);

    expect(query).toHaveBeenCalledExactlyOnceWith('app.bsky.actor.getProfile', { actor: DID });
  });

  it('viewer.muted と、block の uri である viewer.blocking を返す', async () => {
    const { reader } = clientReturning(RA.ok({ did: DID, viewer: { muted: true, blocking: BLOCK } }));

    expect(await reader.resolveViewerState(DID)).toEqual({ ok: true, val: { muted: true, blockUri: BLOCK } });
  });

  it('viewer.blocking がリストの uri なら、ブロックしていないものとして扱う', async () => {
    const { reader } = clientReturning(RA.ok({ did: DID, viewer: { muted: false, blocking: LIST } }));

    expect(await reader.resolveViewerState(DID)).toEqual({ ok: true, val: { muted: false, blockUri: null } });
  });

  it('viewer が無ければ、ミュートもブロックもしていないものとして扱う', async () => {
    const { reader } = clientReturning(RA.ok({ did: DID }));

    expect(await reader.resolveViewerState(DID)).toEqual({ ok: true, val: { muted: false, blockUri: null } });
  });

  it('形の違う応答は invalid_response、取得の失敗はそのまま返す', async () => {
    const invalid = clientReturning(RA.ok({ viewer: { muted: 'yes' } }));
    const failed = clientReturning(RA.err(failure({ kind: 'auth', status: 401 })));

    expect(await invalid.reader.resolveViewerState(DID)).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
    expect(await failed.reader.resolveViewerState(DID)).toMatchObject({ ok: false, err: { kind: 'auth' } });
  });
});

describe('createBlueskyModerationReader の hasBlockRecord', () => {
  it('getRecord を block の uri の repo と rkey で呼び、成功なら true を返す', async () => {
    const { query, reader } = clientReturning(RA.ok({ uri: BLOCK, cid: 'c', value: {} }));

    expect(await reader.hasBlockRecord(BLOCK)).toEqual({ ok: true, val: true });
    expect(query).toHaveBeenCalledExactlyOnceWith('com.atproto.repo.getRecord', {
      repo: 'did:plc:me',
      collection: 'app.bsky.graph.block',
      rkey: '3kblock',
    });
  });

  it('RecordNotFound と 404 は false、それ以外の失敗はそのまま返す', async () => {
    const byCode = clientReturning(RA.err(failure({ status: 400, code: 'RecordNotFound' })));
    const byStatus = clientReturning(RA.err(failure({ status: 404 })));
    const other = clientReturning(RA.err(failure({ status: 500 })));

    expect(await byCode.reader.hasBlockRecord(BLOCK)).toEqual({ ok: true, val: false });
    expect(await byStatus.reader.hasBlockRecord(BLOCK)).toEqual({ ok: true, val: false });
    expect(await other.reader.hasBlockRecord(BLOCK)).toMatchObject({ ok: false, err: { status: 500 } });
  });

  it('block の uri でないものは問い合わせずに invalid_response を返す', async () => {
    const { query, reader } = clientReturning(RA.ok({}));

    expect(await reader.hasBlockRecord(LIST)).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
    expect(query).not.toHaveBeenCalled();
  });
});
