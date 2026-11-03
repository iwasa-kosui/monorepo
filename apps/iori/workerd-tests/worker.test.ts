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

describe('iori Worker on workerd', () => {
  it('responds 200 on /health', async () => {
    const response = await SELF.fetch(`${origin}/health`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });

  it('signs up and signs in with an argon2 password hash', async () => {
    const signedUp = await jsonPost('/api/v1/sign-up', { username, password });
    expect(signedUp.status).toBe(200);
    expect(await signedUp.json()).toEqual({ success: true, username });

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

  it('creates a post through POST /posts and lists it on the timeline', async () => {
    const cookie = requireSession();

    const created = await SELF.fetch(`${origin}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
      body: new URLSearchParams({ content: 'hello from workerd' }),
      redirect: 'manual',
    });
    expect(created.status).toBe(302);
    expect(created.headers.get('Location')).toBe('/');

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
    const missingId = 'a3c6f041-85d7-4a6b-9b9e-4f2d7c5a0b43';
    const activityJson = { Accept: 'application/activity+json' };
    const expectNotFoundVaryingOnAccept = (response: Response) => {
      expect(response.status).toBe(404);
      expect(response.headers.get('Vary')).toContain('Accept');
    };
    const articlePath = (id: string) => `${origin}/users/${username}/articles/${id}`;
    const postPath = (user: string, id: string) => `${origin}/users/${user}/posts/${id}`;

    it('seeds a published, a draft, and an unpublished article', async () => {
      const cookie = requireSession();
      for (const content of ['article root 1', 'article root 2', 'article root 3']) {
        const created = await SELF.fetch(`${origin}/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
          body: new URLSearchParams({ content }),
          redirect: 'manual',
        });
        expect(created.status).toBe(302);
      }
      const author = await env.DB.prepare('SELECT actorId, userId FROM local_actors LIMIT 1').first<
        { actorId: string; userId: string }
      >();
      const roots = await env.DB.prepare(
        'SELECT postId FROM posts WHERE postId NOT IN (SELECT rootPostId FROM articles) LIMIT 3',
      ).all<{ postId: string }>();
      expect(roots.results).toHaveLength(3);
      const [published, draft, unpublished] = roots.results.map((root) => root.postId);
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

    it('returns 404 for an unknown article with application/activity+json', async () => {
      const response = await SELF.fetch(articlePath(missingId), { headers: activityJson });
      expectNotFoundVaryingOnAccept(response);
    });

    it('returns 404 for a draft article with application/activity+json', async () => {
      const response = await SELF.fetch(articlePath(draftId), { headers: activityJson });
      expectNotFoundVaryingOnAccept(response);
    });

    it('returns 404 for a draft article with application/ld+json without a profile', async () => {
      const response = await SELF.fetch(articlePath(draftId), { headers: { Accept: 'application/ld+json' } });
      expectNotFoundVaryingOnAccept(response);
    });

    it('returns 404 for an unpublished article with application/activity+json', async () => {
      const response = await SELF.fetch(articlePath(unpublishedId), { headers: activityJson });
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

    it('keeps serving the HTML shell for an unknown article with text/html', async () => {
      const response = await SELF.fetch(articlePath(missingId), { headers: { Accept: 'text/html' } });
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');
    });

    it('keeps the actor unchanged for application/activity+json', async () => {
      const actor = await SELF.fetch(`${origin}/users/${username}`, { headers: activityJson });
      expect(actor.status).toBe(200);
      expect((await actor.json<{ type: string }>()).type).toBe('Person');
    });

    it('returns 404 for a missing post with application/activity+json', async () => {
      const post = await SELF.fetch(postPath(username, missingId), { headers: activityJson });
      expectNotFoundVaryingOnAccept(post);
    });

    it('keeps serving the HTML shell for a missing post with text/html', async () => {
      const post = await SELF.fetch(postPath(username, missingId), { headers: { Accept: 'text/html' } });
      expect(post.status).toBe(200);
      expect(post.headers.get('Content-Type')).toContain('text/html');
    });

    describe('post objects', () => {
      const otherUserId = 'c4d7a152-96e8-4b7c-8c0f-5a3e8d6b1c54';
      const otherUsername = 'someone';
      const remoteActorId = 'd5e8b263-a7f9-4c8d-9d1a-6b4f9e7c2d65';
      const deletedId = 'e6f9c374-b8a0-4d9e-8e2b-7c5a0f8d3e76';
      const remoteIds = {
        public: 'f70ad485-c9b1-4eaf-9f3c-8d6b1a9e4f87',
        unlisted: '081be596-dac2-4fb0-8a4d-9e7c2b0f5a98',
        private: '192cf6a7-ebd3-40c1-9b5e-0f8d3c1a6ba9',
        direct: '2a3d07b8-fce4-41d2-8c6f-1a9e4d2b7cba',
        unknown: '3b4e18c9-0df5-42e3-9d7a-2b0f5e3c8dcb',
      } as const;
      let localPostId: string;

      it('seeds a local post, a deleted post, and remote posts of each visibility', async () => {
        const author = await env.DB.prepare('SELECT actorId, userId FROM local_actors LIMIT 1').first<
          { actorId: string; userId: string }
        >();
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
        const remotes: [string, string | null][] = [
          [remoteIds.public, 'public'],
          [remoteIds.unlisted, 'unlisted'],
          [remoteIds.private, 'private'],
          [remoteIds.direct, 'direct'],
          [remoteIds.unknown, null],
        ];
        await env.DB.batch([
          env.DB.prepare('INSERT INTO users (userId, username) VALUES (?, ?)').bind(otherUserId, otherUsername),
          env.DB.prepare('INSERT INTO actors (actorId, uri, logoUri, inboxUrl, type) VALUES (?, ?, NULL, ?, ?)').bind(
            remoteActorId,
            'https://remote.example/users/alice',
            'https://remote.example/users/alice/inbox',
            'Person',
          ),
          insertPost.bind(deletedId, author!.actorId, 'deleted post', 1, 'local', 2),
          env.DB.prepare('INSERT INTO local_posts (postId, userId, inReplyToUri) VALUES (?, ?, NULL)').bind(
            deletedId,
            author!.userId,
          ),
          ...remotes.flatMap(([id, visibility]) => [
            insertPost.bind(id, remoteActorId, `remote ${visibility}`, 1, 'remote', null),
            insertRemote.bind(id, `https://remote.example/notes/${id}`, visibility),
          ]),
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

      it.each(['public', 'unlisted', 'private', 'direct', 'unknown'] as const)(
        'returns 404 for a remote post whose visibility is %s',
        async (visibility) => {
          const response = await SELF.fetch(postPath(username, remoteIds[visibility]), { headers: activityJson });
          expectNotFoundVaryingOnAccept(response);
        },
      );

      it('returns 404 for a local post requested under another existing user', async () => {
        const response = await SELF.fetch(postPath(otherUsername, localPostId), { headers: activityJson });
        expectNotFoundVaryingOnAccept(response);
      });

      it('returns 404 for a local post requested under an unknown user', async () => {
        const response = await SELF.fetch(postPath('nobody', localPostId), { headers: activityJson });
        expectNotFoundVaryingOnAccept(response);
      });

      it('returns 404 for a deleted post with application/activity+json', async () => {
        const response = await SELF.fetch(postPath(username, deletedId), { headers: activityJson });
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
});
