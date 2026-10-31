import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

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
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === 'fonts.googleapis.com') {
        return new Response('src: url(https://fonts.gstatic.com/s/notosansjp/font.ttf) format("truetype");');
      }
      if (url.hostname === 'fonts.gstatic.com') return new Response(fontBytes);
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      const startedAt = performance.now();
      const response = await SELF.fetch(`${origin}/api/og/articles/${articleId}`);
      console.log(`OGP generation took ${(performance.now() - startedAt).toFixed(0)} ms`);
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
});
