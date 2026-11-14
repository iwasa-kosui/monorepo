import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { nobleArgon2idDerive } from '../src/domain/password/argon2idDerive.ts';
import { Password } from '../src/domain/password/password.ts';

const origin = 'http://localhost:8787';
const username = 'kosui';
const password = 'workerd-test-password-1';

const jsonPost = (path: string, body: unknown) =>
  SELF.fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

let sessionCookie: string | undefined;

const requireSession = (): string => {
  expect(sessionCookie).toBeDefined();
  return sessionCookie!;
};

const createStatus = async (cookie: string, status: string): Promise<string> => {
  const created = await SELF.fetch(`${origin}/api/v1/statuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin },
    body: JSON.stringify({ status }),
  });
  expect(created.status).toBe(200);
  const body = await created.json<{ id: string }>();
  expect(body.id).toBeTruthy();
  return body.id;
};

describe('iori Worker on workerd', () => {
  it('blocks an AI crawler only for images served from static assets', async () => {
    const gptBot =
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)';
    const mastodon = 'Mastodon/4.3.2 (http.rb/5.2.0; +https://mastodon.social/)';

    const page = await SELF.fetch(`${origin}/health`, { headers: { 'User-Agent': gptBot } });
    expect(page.status).toBe(200);

    const blocked = await SELF.fetch(`${origin}/default-avatar.png`, { headers: { 'User-Agent': gptBot } });
    expect(blocked.status).toBe(403);

    const allowed = await SELF.fetch(`${origin}/default-avatar.png`, { headers: { 'User-Agent': mastodon } });
    expect(allowed.status).not.toBe(403);
  });

  it('signs up and signs in with an argon2 password hash', async () => {
    const signedUp = await SELF.fetch(`${origin}/auth/sign-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
      body: new URLSearchParams({ username, password }),
      redirect: 'manual',
    });
    expect(signedUp.status).toBe(303);
    expect(signedUp.headers.get('Location')).toBe('/sign-in?registered=1');

    const startedAt = performance.now();
    const signedIn = await jsonPost('/api/v1/sign-in', { username, password });
    const elapsedMs = performance.now() - startedAt;
    console.log(`argon2 sign-in took ${elapsedMs.toFixed(0)} ms`);
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual({ success: true });
    sessionCookie = signedIn.headers.getSetCookie().find((cookie: string) => cookie.startsWith('sessionId='))?.split(
      ';',
    )[0];
    expect(sessionCookie).toMatch(/^sessionId=.+/);

    const rejected = await jsonPost('/api/v1/sign-in', { username, password: 'another-password-2' });
    expect(rejected.status).toBe(401);
  });

  it('creates a post through POST /api/v1/statuses and lists it on the timeline', async () => {
    const cookie = requireSession();

    await createStatus(cookie, 'hello from workerd');

    const timeline = await SELF.fetch(`${origin}/api/v1/home`, { headers: { Cookie: cookie } });
    expect(timeline.status).toBe(200);
    const body = await timeline.json<{ timelineItems: { post: { content: string } }[] }>();
    expect(body.timelineItems.map((item: { post: { content: string } }) => item.post.content).join('\n')).toContain(
      'hello from workerd',
    );
  });

  it('generates the OGP image with the wasm renderer on an R2 miss and stores it', async () => {
    const articleId = '3f1d6a52-8c1e-4b6a-9d0e-5a7c2b9e1f40';
    const row = await env.DB.prepare(
      'SELECT l.actorId AS actorId, l.userId AS userId, p.postId AS postId FROM local_actors l JOIN posts p ON p.actorId = l.actorId LIMIT 1',
    ).first<{ actorId: string; userId: string; postId: string }>();
    expect(row).not.toBeNull();
    await env.DB.prepare(
      'INSERT INTO articles (articleId, authorActorId, authorUserId, rootPostId, title, status, createdAt, publishedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(articleId, row!.actorId, row!.userId, row!.postId, 'workerd で OGP 画像を生成する', 'published', 1, 1).run();

    const fontBytes = Uint8Array.from(atob(env.TEST_OG_FONT_BASE64), (char) => char.charCodeAt(0));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.redirect !== 'manual') throw new Error(`Unexpected redirect mode: ${request.redirect}`);
      const url = new URL(request.url);
      if (url.hostname === 'fonts.googleapis.com') {
        return new Response('src: url(https://fonts.gstatic.com/s/notosansjp/font.ttf) format("truetype");');
      }
      if (url.hostname === 'fonts.gstatic.com') return new Response(fontBytes);
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      const response = await SELF.fetch(`${origin}/api/og/articles/${articleId}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
      expect([...new Uint8Array(await response.arrayBuffer()).slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(await env.UPLOADS.head(`og/${articleId}.png`)).not.toBeNull();
    const cached = await SELF.fetch(`${origin}/api/og/articles/${articleId}`);
    expect(cached.status).toBe(200);
  });

  it('serves the ActivityPub actor with a generated key pair', async () => {
    const response = await SELF.fetch(`${origin}/users/${username}`, {
      headers: { Accept: 'application/activity+json' },
    });
    expect(response.status).toBe(200);
    const actor = await response.json<
      { type: string; preferredUsername: string; publicKey?: { publicKeyPem?: string } }
    >();
    expect(actor.type).toBe('Person');
    expect(actor.preferredUsername).toBe(username);
    expect(actor.publicKey?.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  describe('ActivityPub article objects', () => {
    const publishedId = '7b0f3c1e-52a4-4d38-8e6b-1c9a4f2d7e10';
    const draftId = '8c1a4d2f-63b5-4e49-9f7c-2d0b5a3e8f21';
    const unpublishedId = '9d2b5e30-74c6-4f5a-8a8d-3e1c6b4f9a32';
    const activityJson = { Accept: 'application/activity+json' };
    const expectNotFoundVaryingOnAccept = (response: Response) => {
      expect(response.status).toBe(404);
      expect(response.headers.get('Vary')).toContain('Accept');
    };
    const articlePath = (id: string) => `${origin}/users/${username}/articles/${id}`;
    const postPath = (user: string, id: string) => `${origin}/users/${user}/posts/${id}`;

    it('seeds a published, a draft, and an unpublished article', async () => {
      const cookie = requireSession();
      const [published, draft, unpublished] = [
        await createStatus(cookie, 'article root 1'),
        await createStatus(cookie, 'article root 2'),
        await createStatus(cookie, 'article root 3'),
      ];
      const author = await env.DB.prepare('SELECT actorId, userId FROM local_actors LIMIT 1').first<
        { actorId: string; userId: string }
      >();
      const insert = env.DB.prepare(
        'INSERT INTO articles (articleId, authorActorId, authorUserId, rootPostId, title, status, createdAt, publishedAt, unpublishedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      await env.DB.batch([
        insert.bind(
          publishedId,
          author!.actorId,
          author!.userId,
          published,
          'published article',
          'published',
          1,
          2,
          null,
        ),
        insert.bind(draftId, author!.actorId, author!.userId, draft, 'draft article', 'draft', 1, null, null),
        insert.bind(
          unpublishedId,
          author!.actorId,
          author!.userId,
          unpublished,
          'unpublished article',
          'unpublished',
          1,
          2,
          3,
        ),
      ]);
    });

    it('returns 404 for a draft article with application/activity+json', async () => {
      const response = await SELF.fetch(articlePath(draftId), { headers: activityJson });
      expectNotFoundVaryingOnAccept(response);
    });

    it('returns the Article for a published article with application/activity+json', async () => {
      const response = await SELF.fetch(articlePath(publishedId), { headers: activityJson });
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/activity+json');
      const article = await response.json<{ type: string; id: string; name: string }>();
      expect(article.type).toBe('Article');
      expect(article.id).toBe(articlePath(publishedId));
      expect(article.name).toBe('published article');
    });

    describe('post objects', () => {
      const remoteActorId = 'd5e8b263-a7f9-4c8d-9d1a-6b4f9e7c2d65';
      const remotePublicId = 'f70ad485-c9b1-4eaf-9f3c-8d6b1a9e4f87';
      let localPostId: string;

      it('seeds a public remote post', async () => {
        const local = await env.DB.prepare(
          'SELECT p.postId AS postId FROM posts p JOIN local_posts l ON l.postId = p.postId WHERE p.deletedAt IS NULL LIMIT 1',
        ).first<{ postId: string }>();
        localPostId = local!.postId;
        const insertPost = env.DB.prepare(
          'INSERT INTO posts (postId, actorId, content, createdAt, type, deletedAt) VALUES (?, ?, ?, ?, ?, ?)',
        );
        const insertRemote = env.DB.prepare(
          'INSERT INTO remote_posts (postId, uri, inReplyToUri, visibility) VALUES (?, ?, NULL, ?)',
        );
        await env.DB.batch([
          env.DB.prepare('INSERT INTO actors (actorId, uri, logoUri, inboxUrl, type) VALUES (?, ?, NULL, ?, ?)').bind(
            remoteActorId,
            'https://remote.example/users/alice',
            'https://remote.example/users/alice/inbox',
            'Person',
          ),
          insertPost.bind(remotePublicId, remoteActorId, 'remote public', 1, 'remote', null),
          insertRemote.bind(remotePublicId, `https://remote.example/notes/${remotePublicId}`, 'public'),
        ]);
      });

      it('returns the Note for a public local post with the author identifier', async () => {
        const response = await SELF.fetch(postPath(username, localPostId), { headers: activityJson });
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/activity+json');
        const note = await response.json<{ type: string; id: string }>();
        expect(note.type).toBe('Note');
        expect(note.id).toBe(postPath(username, localPostId));
      });

      it('returns 404 for a public remote post', async () => {
        const response = await SELF.fetch(postPath(username, remotePublicId), { headers: activityJson });
        expectNotFoundVaryingOnAccept(response);
      });
    });
  });

  it('verifies a stored @noble/hashes password hash with the WASM Argon2id', async () => {
    const nobleHashedPassword = 'noble-hashed-password-1';
    const hashed = await Password.hashPassword(nobleArgon2idDerive)(Password.orThrow(nobleHashedPassword));
    await env.DB.prepare(
      'UPDATE user_passwords SET nonceHex = ?, tagHex = ? WHERE userId = (SELECT userId FROM users WHERE username = ?)',
    ).bind(hashed.nonceHex, hashed.tagHex, username).run();

    const signedIn = await jsonPost('/api/v1/sign-in', { username, password: nobleHashedPassword });
    expect(signedIn.status).toBe(200);
    const rejected = await jsonPost('/api/v1/sign-in', { username, password });
    expect(rejected.status).toBe(401);
  });

  describe('article editing', () => {
    const articleId = 'b4d7a152-96e8-4b7c-8c0f-5a3e8d6b1c54';
    const digestHtml =
      '<h2>新着</h2><ul><li><a href="https://example.com/first">First</a>（はてなブックマーク 12）<br>一行目<br>二行目</li></ul>';

    it('converts the stored HTML to Markdown with turndown on workerd', async () => {
      const cookie = requireSession();
      const author = await env.DB.prepare('SELECT actorId, userId FROM local_actors LIMIT 1').first<
        { actorId: string; userId: string }
      >();
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO articles (articleId, authorActorId, authorUserId, rootPostId, title, status, createdAt, publishedAt, unpublishedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(articleId, author!.actorId, author!.userId, null, 'ダイジェスト', 'draft', 1, null, null),
        env.DB.prepare(
          'INSERT INTO article_bodies (articleId, privateHtml, publicHtml, updatedAt) VALUES (?, ?, ?, ?)',
        ).bind(articleId, digestHtml, digestHtml, 1),
      ]);

      const response = await SELF.fetch(`${origin}/api/iori/v1/articles/${articleId}/edit`, {
        headers: { Cookie: cookie },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        title: 'ダイジェスト',
        markdown:
          '## 新着\n\n-   [First](https://example.com/first)（はてなブックマーク 12）  \n    一行目  \n    二行目',
        updatedAt: 1,
      });
    });

    it('saves the edited Markdown as HTML and returns it when the editor is opened again', async () => {
      const cookie = requireSession();
      const markdown = '## 編集後\n\n本文 [link](https://example.com/a)';

      const saved = await SELF.fetch(`${origin}/api/iori/v1/articles/${articleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin },
        body: JSON.stringify({ title: '編集後のタイトル', markdown, baseUpdatedAt: 1 }),
      });
      expect(saved.status).toBe(200);

      const detail = await SELF.fetch(`${origin}/api/iori/v1/articles/${articleId}`, { headers: { Cookie: cookie } });
      const body = await detail.json<{ article: { title: string }; body: { html: string } }>();
      expect(body.article.title).toBe('編集後のタイトル');
      expect(body.body.html).toContain('<h2>編集後</h2>');
      const reopened = await SELF.fetch(`${origin}/api/iori/v1/articles/${articleId}/edit`, {
        headers: { Cookie: cookie },
      });
      expect(await reopened.json()).toEqual({ title: '編集後のタイトル', markdown, updatedAt: expect.any(Number) });
    });
  });
});
