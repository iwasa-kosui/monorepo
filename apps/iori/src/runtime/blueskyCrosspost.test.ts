import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { blueskyRkeyOf } from '../domain/blueskyCrosspost/blueskyRkey.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createBlueskyCrosspostUseCases, resolveBlueskyCrosspostConfig } from './blueskyCrosspost.ts';

const enabled = {
  IORI_BLUESKY_CROSSPOST: 'enabled',
  BLUESKY_IDENTIFIER: ' iori.example.com ',
  BLUESKY_APP_PASSWORD: 'app-pass',
};

describe('resolveBlueskyCrosspostConfig', () => {
  it('enabled と空でない 2 つの secret がそろったときだけ設定を返す', () => {
    expect(resolveBlueskyCrosspostConfig(enabled)).toEqual({ identifier: 'iori.example.com', appPassword: 'app-pass' });
    expect(resolveBlueskyCrosspostConfig({ ...enabled, IORI_BLUESKY_CROSSPOST: 'disabled' })).toBeUndefined();
    expect(resolveBlueskyCrosspostConfig({ ...enabled, IORI_BLUESKY_CROSSPOST: undefined })).toBeUndefined();
    expect(resolveBlueskyCrosspostConfig({ ...enabled, BLUESKY_IDENTIFIER: '' })).toBeUndefined();
    expect(resolveBlueskyCrosspostConfig({ ...enabled, BLUESKY_APP_PASSWORD: undefined })).toBeUndefined();
  });
});

describe('createBlueskyCrosspostUseCases', () => {
  it('無効なときは use case を作らず、waitUntil も呼ばない', () => {
    const waitUntil = () => {
      throw new Error('waitUntil must not be called');
    };
    const env = { ...enabled, IORI_BLUESKY_CROSSPOST: 'disabled' } as unknown as IoriWorkerEnv;
    expect(createBlueskyCrosspostUseCases(env, waitUntil)).toBeUndefined();
  });

  it('有効なときは、保存済みセッションで Bluesky に投稿し、対応表に sent を残す', async () => {
    const { binding, sqlite } = createSqliteD1Fixture();
    const now = Date.UTC(2026, 10, 8);
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(
      '00000000-0000-4000-8000-000000000001',
      'kosui',
    );
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
      '00000000-0000-4000-8000-000000000002',
      'https://iori.test/users/kosui',
      'https://iori.test/users/kosui/inbox',
      'local',
    );
    sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    );
    const postId = '00000000-0000-4000-8000-000000000003';
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
      postId,
      '00000000-0000-4000-8000-000000000002',
      '<p>hello</p>',
      now,
      'local',
    );
    sqlite.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (?,?,?)').run(
      postId,
      '00000000-0000-4000-8000-000000000001',
      null,
    );
    sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
      .run('default', 'did:plc:abc', 'iori.example.com', 'https://pds.example.net', 'access', 'refresh', now);
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k1', cid: 'bafy' }), {
        status: 200,
      });
    }) as typeof fetch;
    const waiting: Promise<unknown>[] = [];
    const env = { ...enabled, DB: binding, UPLOADS: {}, ORIGIN: 'https://iori.test' } as unknown as IoriWorkerEnv;

    const useCases = createBlueskyCrosspostUseCases(env, (promise) => waiting.push(promise), { fetch: fetchStub });
    await useCases!.schedule.run({ postId: postId as never });
    await Promise.all(waiting);

    expect(requests).toEqual([{
      url: 'https://pds.example.net/xrpc/com.atproto.repo.createRecord',
      body: {
        repo: 'did:plc:abc',
        collection: 'app.bsky.feed.post',
        rkey: blueskyRkeyOf({ postId: postId as never, createdAt: now as never }),
        record: { $type: 'app.bsky.feed.post', text: 'hello', createdAt: new Date(now).toISOString() },
      },
    }]);
    expect(sqlite.prepare('SELECT status, rkey FROM bluesky_crossposts').all()).toEqual([
      { status: 'sent', rkey: '3k1' },
    ]);
  });
});
