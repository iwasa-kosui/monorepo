import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from './adaptor/d1/__tests__/sqliteFixture.ts';
import {
  AccountSchema,
  CredentialAccountSchema,
  InstanceV2Schema,
  MediaAttachmentSchema,
  NotificationSchema,
  StatusSchema,
} from './adaptor/mastodon/entities.ts';
import { admissionFixture } from './testing/admissionFixture.ts';
import worker from './worker.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const origin = 'https://worker.test';
const userId = crypto.randomUUID();
const actorId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const executionContext = {} as ExecutionContext;

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
    actorId,
    `${origin}/users/kosui`,
    `${origin}/users/kosui/inbox`,
    'local',
  );
  sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(actorId, userId);
  sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
    sessionId,
    userId,
    Date.now() + 60_000,
  );
  sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
    crypto.randomUUID(),
    actorId,
    'hello',
    Date.UTC(2025, 0, 2),
    'local',
  );
  const objects = new Map<string, { body: ArrayBufferView<ArrayBuffer>; httpMetadata?: { contentType?: string } }>();
  const env = {
    DB: fixture.binding,
    UPLOADS: {
      get: async (key: string) => {
        const object = objects.get(key);
        return object === undefined
          ? null
          : { body: new Blob([object.body]).stream(), httpMetadata: object.httpMetadata };
      },
      put: async (
        key: string,
        body: ArrayBufferView<ArrayBuffer>,
        options: { httpMetadata?: { contentType?: string } },
      ) => {
        objects.set(key, { body, httpMetadata: options.httpMetadata });
      },
      head: async () => null,
    },
    FEDIFY_KV: { get: async () => null },
    FEDIFY_QUEUE: { send: async () => undefined, sendBatch: async () => undefined },
    ASSETS: {
      fetch: async (input: RequestInfo | URL) =>
        new URL(String(input)).pathname === '/manifest.json'
          ? new Response('{}', { status: 200 })
          : new Response('Not Found', { status: 404 }),
    },
    ...admissionFixture(),
    VAPID_SUBJECT: 'mailto:admin@example.invalid',
    VAPID_PUBLIC_KEY: 'fixture-public',
    VAPID_PRIVATE_KEY: 'fixture-private',
  } as unknown as IoriWorkerEnv;
  const request = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`${origin}${path}`, init), env, executionContext);
  return { request, sqlite, objects };
};

describe('Worker の Mastodon 互換 API', () => {
  it('/.well-known/oauth-authorization-server を Fedify の後ろで返す', async () => {
    const response = await setup().request('/.well-known/oauth-authorization-server');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
    });
  });

  it('/.well-known/nodeinfo と /nodeinfo/2.1 を Fedify が返す', async () => {
    const { request } = setup();

    const [links, nodeinfo] = await Promise.all([request('/.well-known/nodeinfo'), request('/nodeinfo/2.1')]);

    expect(links.status).toBe(200);
    expect(await links.json()).toMatchObject({
      links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${origin}/nodeinfo/2.1` }],
    });
    expect(nodeinfo.status).toBe(200);
    expect(await nodeinfo.json()).toMatchObject({ software: { name: 'iori' }, protocols: ['activitypub'] });
  });

  it('/oauth/authorize は client_id がなければ画面でエラーを返す', async () => {
    const response = await setup().request('/oauth/authorize');

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toContain('text/html');
  });

  it('アプリを登録して client_credentials のトークンで apps/verify_credentials を呼べる', async () => {
    const { request } = setup();

    const registered = await request('/api/v1/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Ivory', redirect_uris: 'urn:ietf:wg:oauth:2.0:oob', scopes: 'read' }),
    });
    const app = await registered.json() as { client_id: string; client_secret: string };
    const token = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: app.client_id,
        client_secret: app.client_secret,
        scope: 'read',
      }),
    });
    const { access_token } = await token.json() as { access_token: string };
    const verified = await request('/api/v1/apps/verify_credentials', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(registered.status).toBe(200);
    expect(token.status).toBe(200);
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ name: 'Ivory' });
  });

  it('/api/v2/instance を認証なしで返し、連絡先とキーを D1 と環境から入れる', async () => {
    const response = await setup().request('/api/v2/instance');

    expect(response.status).toBe(200);
    const body = InstanceV2Schema.parse(await response.json());
    expect(body).toMatchObject({
      domain: 'worker.test',
      title: 'worker.test',
      description: 'A microblog by kosui',
      contact: { account: { username: 'kosui', statuses_count: 1 } },
      configuration: { vapid: { public_key: 'fixture-public' } },
    });
  });

  it('Cookie の利用者で verify_credentials を返す', async () => {
    const response = await setup().request('/api/v1/accounts/verify_credentials', {
      headers: { Cookie: `sessionId=${sessionId}` },
    });

    expect(response.status).toBe(200);
    expect(CredentialAccountSchema.parse(await response.json())).toMatchObject({
      id: actorId,
      username: 'kosui',
      statuses_count: 1,
      last_status_at: '2025-01-02',
      avatar: `${origin}/default-avatar.png`,
    });
  });

  it('認証がなければ verify_credentials は 401 にする', async () => {
    const response = await setup().request('/api/v1/accounts/verify_credentials');

    expect(response.status).toBe(401);
  });

  it('未実装の /api/v1 と /api/v2 のパスは 404 の JSON にし、認証付きの要求をログに出す', async () => {
    const { request } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const headers = { Cookie: `sessionId=${sessionId}` };

    const [v1, v2] = await Promise.all([
      request('/api/v1/statuses/abc/favourited_by?q=1', { headers }),
      request('/api/v2/suggestions', { method: 'POST', headers }),
    ]);

    expect([v1.status, v2.status]).toEqual([404, 404]);
    expect(await v1.json()).toEqual({ error: 'Record not found' });
    expect(warn).toHaveBeenCalledWith('Unimplemented Mastodon API: GET /api/v1/statuses/abc/favourited_by');
    expect(warn).toHaveBeenCalledWith('Unimplemented Mastodon API: POST /api/v2/suggestions');
    warn.mockRestore();
  });

  it('/、/sign-in、/.well-known/webfinger を Mastodon のルーターと受け皿の 404 に取らせない', async () => {
    const { request } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const responses = await Promise.all([
      request('/', { headers: { Authorization: 'Bearer none' } }),
      request('/sign-in', { headers: { Authorization: 'Bearer none' } }),
      request('/.well-known/webfinger?resource=acct:kosui@worker.test', { headers: { Authorization: 'Bearer none' } }),
    ]);

    const bodies = await Promise.all(responses.map((response) => response.text()));
    for (const body of bodies) {
      expect(body).not.toContain('Record not found');
    }
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(warn.mock.calls.some((call) => String(call[0]).startsWith('Unimplemented Mastodon API'))).toBe(false);
    warn.mockRestore();
  });

  describe('ホームと投稿の表示', () => {
    const seedPost = (sqlite: ReturnType<typeof setup>['sqlite'], createdAt: number) => {
      const postId = crypto.randomUUID();
      sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
        postId,
        actorId,
        '<p>seeded</p>',
        createdAt,
        'local',
      );
      sqlite.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (?,?,?)').run(postId, userId, null);
      sqlite.prepare(
        'INSERT INTO timeline_items(timelineItemId,type,actorId,postId,repostId,createdAt) VALUES (?,?,?,?,?,?)',
      ).run(crypto.randomUUID(), 'post', actorId, postId, null, createdAt);
      return postId;
    };

    it('Cookie の利用者に timelines/home と statuses/:id を返し、Link ヘッダーを付ける', async () => {
      const { request, sqlite } = setup();
      const older = seedPost(sqlite, Date.UTC(2025, 0, 3));
      const newer = seedPost(sqlite, Date.UTC(2025, 0, 4));
      const headers = { Cookie: `sessionId=${sessionId}` };

      const home = await request('/api/v1/timelines/home?limit=1', { headers });
      const status = await request(`/api/v1/statuses/${older}`, { headers });
      const context = await request(`/api/v1/statuses/${older}/context`);

      expect(home.status).toBe(200);
      const [first] = await home.json() as unknown[];
      expect(StatusSchema.parse(first)).toMatchObject({ id: newer, account: { id: actorId, username: 'kosui' } });
      expect(home.headers.get('Link')).toContain(`max_id=${newer}`);
      expect(status.status).toBe(200);
      expect(StatusSchema.parse(await status.json()).id).toBe(older);
      expect(await context.json()).toEqual({ ancestors: [], descendants: [] });
    });

    it('timelines/public は未認証でローカルの投稿を返し、remote=true は 401 にする', async () => {
      const { request, sqlite } = setup();
      const postId = seedPost(sqlite, Date.UTC(2025, 0, 3));

      const [local, remote, missing] = await Promise.all([
        request('/api/v1/timelines/public?local=true'),
        request('/api/v1/timelines/public?remote=true'),
        request(`/api/v1/statuses/${crypto.randomUUID()}`),
      ]);

      expect(local.status).toBe(200);
      expect((await local.json() as Array<{ id: string }>).map((status) => status.id)).toEqual([postId]);
      expect(remote.status).toBe(401);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: 'Record not found' });
    });

    it('accounts/:id と accounts/:id/statuses を未認証で返し、Link ヘッダーを付ける', async () => {
      const { request, sqlite } = setup();
      const older = seedPost(sqlite, Date.UTC(2025, 0, 3));
      const newer = seedPost(sqlite, Date.UTC(2025, 0, 4));

      const account = await request(`/api/v1/accounts/${actorId}`);
      const statuses = await request(`/api/v1/accounts/${actorId}/statuses?limit=1`);
      const next = await request(`/api/v1/accounts/${actorId}/statuses?limit=1&max_id=${newer}`);
      const missing = await request(`/api/v1/accounts/${crypto.randomUUID()}`);

      expect(account.status).toBe(200);
      expect(AccountSchema.parse(await account.json())).toMatchObject({ id: actorId, username: 'kosui' });
      expect(statuses.status).toBe(200);
      const [first] = await statuses.json() as unknown[];
      expect(StatusSchema.parse(first)).toMatchObject({ id: newer, account: { id: actorId } });
      expect(statuses.headers.get('Link')).toContain(`max_id=${newer}`);
      expect((await next.json() as Array<{ id: string }>).map((status) => status.id)).toEqual([older]);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: 'Record not found' });
    });

    it('accounts/familiar_followers を :id に取らせず、認証がなければ 401 にする', async () => {
      const { request } = setup();
      const headers = { Cookie: `sessionId=${sessionId}` };

      const [familiar, anonymous] = await Promise.all([
        request('/api/v1/accounts/familiar_followers?id[]=a', { headers }),
        request('/api/v1/accounts/familiar_followers?id[]=a'),
      ]);

      expect(familiar.status).toBe(200);
      expect(await familiar.json()).toEqual([{ id: 'a', accounts: [] }]);
      expect(anonymous.status).toBe(401);
    });

    it('timelines/home は認証がなければ 401 にする', async () => {
      const response = await setup().request('/api/v1/timelines/home');

      expect(response.status).toBe(401);
    });

    it('Cookie の利用者に通知と未読数とマーカーを返し、認証がなければ Mastodon 形式の 401 にする', async () => {
      const { request, sqlite } = setup();
      const followerId = crypto.randomUUID();
      const notificationId = crypto.randomUUID();
      sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
        followerId,
        'https://remote.example/users/alice',
        'https://remote.example/users/alice/inbox',
        'remote',
      );
      sqlite.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').run(
        followerId,
        'https://remote.example/@alice',
        'alice',
      );
      sqlite.prepare(
        'INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)',
      )
        .run(notificationId, userId, 'follow', 0, 1_000);
      sqlite.prepare('INSERT INTO notification_follows(notificationId,followerActorId) VALUES (?,?)')
        .run(notificationId, followerId);
      const headers = { Cookie: `sessionId=${sessionId}` };

      const list = await request('/api/v1/notifications', { headers });
      const unreadBefore = await request('/api/v2/notifications/unread_count', { headers });
      const saved = await request('/api/v1/markers', {
        method: 'POST',
        headers: { ...headers, Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: { last_read_id: notificationId } }),
      });
      const unreadAfter = await request('/api/v1/notifications/unread_count', { headers });
      const anonymous = await request('/api/v1/notifications');

      expect(list.status).toBe(200);
      expect(NotificationSchema.parse((await list.json() as unknown[])[0])).toMatchObject({
        id: notificationId,
        type: 'follow',
        account: { acct: 'alice@remote.example' },
      });
      expect(await unreadBefore.json()).toEqual({ count: 1 });
      expect(await saved.json()).toMatchObject({ notifications: { last_read_id: notificationId, version: 1 } });
      expect(await unreadAfter.json()).toEqual({ count: 0 });
      expect(anonymous.status).toBe(401);
      expect(await anonymous.json()).toEqual({ error: 'The access token is invalid' });
    });

    it('消した独自 API のパスは未実装として 404 の JSON を返す', async () => {
      const { request } = setup();

      const responses = await Promise.all([
        request('/api/v1/server-timeline'),
        request('/api/v1/federated'),
        request('/api/v1/thread?postId=x'),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    });

    it('置き換えた独自 API のパスは Cookie があっても未実装として 404 の JSON を返す', async () => {
      const { request } = setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const headers = { Cookie: `sessionId=${sessionId}` };

      const responses = await Promise.all([
        request('/api/v1/users/kosui/posts', { headers }),
        request(`/api/v1/remote-users/${crypto.randomUUID()}/posts`, { headers }),
        request('/api/v1/liked-posts', { headers }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
      expect(await responses[2]!.json()).toEqual({ error: 'Record not found' });
      warn.mockRestore();
    });

    it('置き換えた独自の書き込み API のパスは Cookie があっても未実装として 404 を返す', async () => {
      const { request } = setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const headers = { Cookie: `sessionId=${sessionId}`, Origin: origin, 'Content-Type': 'application/json' };
      const body = JSON.stringify({ postId: crypto.randomUUID(), actorId: crypto.randomUUID(), handle: '@a@b.test' });

      const responses = await Promise.all([
        request('/api/v1/like', { method: 'POST', headers, body }),
        request('/api/v1/like', { method: 'DELETE', headers, body }),
        request('/api/v1/repost', { method: 'POST', headers, body }),
        request('/api/v1/repost', { method: 'DELETE', headers, body }),
        request('/api/v1/mute', { method: 'POST', headers, body }),
        request('/api/v1/mute', { method: 'DELETE', headers, body }),
        request('/api/v1/follow', { method: 'POST', headers, body }),
        request(`/remote-users/${crypto.randomUUID()}/follow`, { method: 'POST', headers }),
        request(`/remote-users/${crypto.randomUUID()}/unfollow`, { method: 'POST', headers }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404, 404]);
      warn.mockRestore();
    });

    it('Cookie の利用者の いいね、ミュート、通知の削除を実際の配線で処理する', async () => {
      const { request, sqlite } = setup();
      const headers = { Cookie: `sessionId=${sessionId}`, Origin: origin };
      const postId = crypto.randomUUID();
      sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
        postId,
        actorId,
        '<p>mine</p>',
        Date.UTC(2025, 0, 3),
        'local',
      );
      sqlite.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (?,?,?)').run(postId, userId, null);
      const remoteId = crypto.randomUUID();
      sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
        remoteId,
        'https://remote.example/users/alice',
        'https://remote.example/users/alice/inbox',
        'remote',
      );
      sqlite.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').run(
        remoteId,
        'https://remote.example/@alice',
        'alice',
      );
      const notificationId = crypto.randomUUID();
      sqlite.prepare(
        'INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)',
      )
        .run(notificationId, userId, 'follow', 0, Date.UTC(2025, 0, 4));
      sqlite.prepare('INSERT INTO notification_follows(notificationId,followerActorId) VALUES (?,?)').run(
        notificationId,
        remoteId,
      );

      const favourite = await request(`/api/v1/statuses/${postId}/favourite`, { method: 'POST', headers });
      const mute = await request(`/api/v1/accounts/${remoteId}/mute`, { method: 'POST', headers });
      const dismiss = await request(`/api/v2/notifications/ungrouped-${notificationId}/dismiss`, {
        method: 'POST',
        headers,
      });
      const clear = await request('/api/v1/notifications/clear', { method: 'POST', headers });
      const crossOrigin = await request(`/api/v1/statuses/${postId}/unfavourite`, {
        method: 'POST',
        headers: { Cookie: headers.Cookie, Origin: 'https://evil.example' },
      });

      expect(StatusSchema.parse(await favourite.json())).toMatchObject({ id: postId, favourited: true });
      expect(await mute.json()).toMatchObject({ id: remoteId, muting: true });
      expect([dismiss.status, clear.status, crossOrigin.status]).toEqual([200, 200, 403]);
      expect(sqlite.prepare('SELECT count(*) AS n FROM notifications').get()).toEqual({ n: 0 });
      expect(sqlite.prepare('SELECT count(*) AS n FROM likes').get()).toEqual({ n: 1 });
    });

    it('accounts/lookup、accounts/relationships、favourites、mutes を Mastodon の形で返す', async () => {
      const { request, sqlite } = setup();
      const headers = { Cookie: `sessionId=${sessionId}` };
      const postId = crypto.randomUUID();
      sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
        postId,
        actorId,
        '<p>liked</p>',
        Date.UTC(2025, 0, 3),
        'local',
      );
      sqlite.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (?,?,?)').run(postId, userId, null);
      sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
        crypto.randomUUID(),
        actorId,
        postId,
        'local',
        Date.UTC(2025, 0, 4),
      );

      const [lookup, relationships, favourites, mutes] = await Promise.all([
        request('/api/v1/accounts/lookup?acct=kosui'),
        request(`/api/v1/accounts/relationships?id[]=${actorId}`, { headers }),
        request('/api/v1/favourites', { headers }),
        request('/api/v1/mutes', { headers }),
      ]);

      expect(lookup.status).toBe(200);
      expect(AccountSchema.parse(await lookup.json())).toMatchObject({ id: actorId, acct: 'kosui' });
      expect(await relationships.json()).toMatchObject([{ id: actorId, following: false, muting: false }]);
      expect((await favourites.json() as Array<{ id: string }>).map((status) => status.id)).toEqual([postId]);
      expect(await mutes.json()).toEqual([]);
    });
  });

  describe('メディアとプロフィール画像', () => {
    const png = () => {
      const bytes = new Uint8Array(32);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      return bytes;
    };
    const headers = { Cookie: `sessionId=${sessionId}`, Origin: origin };
    const form = (values: Record<string, string | File>) => {
      const body = new FormData();
      for (const [key, value] of Object.entries(values)) body.set(key, value);
      return body;
    };

    it('POST /api/v2/media が R2 と media_uploads に保存し、返した url で画像を配信できる', async () => {
      const { request, sqlite, objects } = setup();

      const created = await request('/api/v2/media', {
        method: 'POST',
        headers,
        body: form({ file: new File([png()], 'a.png', { type: 'image/png' }), description: '猫' }),
      });

      expect(created.status).toBe(200);
      const media = MediaAttachmentSchema.parse(await created.json());
      expect(media).toMatchObject({ type: 'image', description: '猫', url: `${origin}/uploads/${media.id}.png` });
      expect(objects.has(`post-images/${media.id}/original`)).toBe(true);
      expect(
        sqlite.prepare('SELECT userId, url, mimeType, description FROM media_uploads WHERE mediaId = ?').get(media.id),
      )
        .toMatchObject({ userId, url: media.url, mimeType: 'image/png', description: '猫' });
      const served = await request(`/uploads/${media.id}.png`);
      expect(served.status).toBe(200);
      expect(served.headers.get('Content-Type')).toBe('image/png');
      expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('PUT で説明を更新して GET に反映し、他人には見せない', async () => {
      const { request, sqlite } = setup();
      const created = await request('/api/v2/media', {
        method: 'POST',
        headers,
        body: form({ file: new File([png()], 'a.png', { type: 'image/png' }) }),
      });
      const { id } = await created.json() as { id: string };
      const strangerId = crypto.randomUUID();
      const strangerSession = crypto.randomUUID();
      sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(strangerId, 'stranger');
      sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
        strangerSession,
        strangerId,
        Date.now() + 60_000,
      );

      const put = await request(`/api/v1/media/${id}`, { method: 'PUT', headers, body: form({ description: '犬' }) });
      const get = await request(`/api/v1/media/${id}`, { headers });
      const stranger = await request(`/api/v1/media/${id}`, { headers: { Cookie: `sessionId=${strangerSession}` } });

      expect(put.status).toBe(200);
      expect(await get.json()).toMatchObject({ id, description: '犬' });
      expect(stranger.status).toBe(404);
      expect(sqlite.prepare('SELECT description FROM media_uploads WHERE mediaId = ?').get(id))
        .toMatchObject({ description: '犬' });
      expect(
        sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateName = \'mediaUpload\' ORDER BY occurredAt')
          .all(),
      )
        .toEqual([{ eventName: 'mediaUpload.created' }, { eventName: 'mediaUpload.descriptionUpdated' }]);
    });

    it('PATCH /api/v1/accounts/update_credentials が avatar を保存し、logoUri と verify_credentials に反映する', async () => {
      const { request, sqlite, objects } = setup();

      const response = await request('/api/v1/accounts/update_credentials', {
        method: 'PATCH',
        headers,
        body: form({ avatar: new File([png()], 'a.png', { type: 'image/png' }) }),
      });

      expect(response.status).toBe(200);
      const body = CredentialAccountSchema.parse(await response.json());
      expect(body.avatar).toMatch(new RegExp(`^${origin}/uploads/[0-9a-f-]{36}\\.png$`));
      expect(objects.size).toBe(1);
      expect(sqlite.prepare('SELECT logoUri FROM actors WHERE actorId = ?').get(actorId)).toEqual({
        logoUri: body.avatar,
      });
      const verified = await request('/api/v1/accounts/verify_credentials', { headers });
      expect(await verified.json()).toMatchObject({ avatar: body.avatar });
    });

    it('置き換えた POST /api/v1/upload と POST /users/:username は 404 にして、logoUri を変えない', async () => {
      const { request, sqlite } = setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const upload = await request('/api/v1/upload', {
        method: 'POST',
        headers,
        body: form({ file: new File([png()], 'a.png', { type: 'image/png' }) }),
      });
      const users = await request('/users/kosui', {
        method: 'POST',
        headers,
        body: new URLSearchParams({ logoUri: 'https://cdn.example/logo.png' }),
      });

      expect([upload.status, users.status]).toEqual([404, 404]);
      expect(sqlite.prepare('SELECT logoUri FROM actors WHERE actorId = ?').get(actorId)).toEqual({ logoUri: null });
      warn.mockRestore();
    });
  });

  it('既存の独自 API と /api/og/* の応答を変えない', async () => {
    const { request } = setup();

    const [home, vapid, og] = await Promise.all([
      request('/api/v1/home'),
      request('/api/v1/push/vapid-public-key'),
      request('/api/og/articles/not-an-id'),
    ]);

    expect([home.status, vapid.status, og.status]).toEqual([
      401,
      200,
      404,
    ]);
    expect(await home.json()).toEqual({ error: 'Unauthorized' });
    expect(await vapid.json()).toEqual({ publicKey: 'fixture-public' });
    expect(await og.text()).toBe('Not Found');
  });
});
