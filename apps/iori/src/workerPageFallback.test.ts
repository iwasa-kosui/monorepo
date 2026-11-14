import { describe, expect, it } from 'vitest';

import { UserId } from './domain/user/userId.ts';
import { createWorkerPageFallback } from './workerPageFallback.ts';

describe('createWorkerPageFallback', () => {
  it.each(['/posts', '/posts/a/b'])('does not render a page for %s', async (path) => {
    expect(await createWorkerPageFallback(new Request(`https://worker.test${path}`))).toBeUndefined();
  });

  it('redirects the private X page to /sign-in when logged out, without caching', async () => {
    const anonymous = await createWorkerPageFallback(new Request('https://worker.test/x'));
    const expired = await createWorkerPageFallback(
      new Request('https://worker.test/x', {
        headers: { Cookie: 'sessionId=expired' },
      }),
      { isLoggedIn: false },
    );

    for (const response of [anonymous, expired]) {
      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe('/sign-in');
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(await response?.text()).toBe('');
    }
  });

  it('redirects the private Bluesky profile page to /sign-in when logged out, without caching', async () => {
    for (const path of ['/bluesky/profile/did%3Aplc%3Aalice', '/bluesky/profile/alice.bsky.social/']) {
      const response = await createWorkerPageFallback(new Request(`https://worker.test${path}`));

      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe('/sign-in');
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('does not claim a Bluesky profile path without an actor or with extra segments', async () => {
    for (const path of ['/bluesky/profile', '/bluesky/profile/', '/bluesky/profile/a/b']) {
      expect(await createWorkerPageFallback(new Request(`https://worker.test${path}`))).toBeUndefined();
    }
  });

  it('redirects the federated timeline to /sign-in when logged out, without caching', async () => {
    const anonymous = await createWorkerPageFallback(new Request('https://worker.test/federated'));
    const expired = await createWorkerPageFallback(
      new Request('https://worker.test/federated', {
        headers: { Cookie: 'sessionId=expired' },
      }),
      { isLoggedIn: false },
    );

    for (const response of [anonymous, expired]) {
      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe('/sign-in');
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(await response?.text()).toBe('');
    }
  });

  it('redirects the Bluesky post page to /sign-in when logged out, without caching', async () => {
    const url = 'https://worker.test/bluesky/profile/did:plc:abc/post/3kxyz';
    const anonymous = await createWorkerPageFallback(new Request(url));
    const expired = await createWorkerPageFallback(
      new Request(url, { headers: { Cookie: 'sessionId=expired' } }),
      { isLoggedIn: false },
    );

    for (const response of [anonymous, expired]) {
      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe('/sign-in');
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(await response?.text()).toBe('');
    }
  });

  it('renders the Bluesky post page for a logged-in user with noindex', async () => {
    const response = await createWorkerPageFallback(
      new Request('https://worker.test/bluesky/profile/did:plc:abc/post/3kxyz'),
      { isLoggedIn: true, userId: UserId.generate() },
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(await response?.text()).toContain('/static/blueskyPost.js');
  });

  it('does not register Bluesky post paths that are not a DID and an rkey', async () => {
    for (
      const path of [
        '/bluesky/profile/alice.bsky.social/post/3kxyz',
        '/bluesky/profile/did:plc:abc/post',
        '/bluesky/profile/did:plc:abc/post/3kxyz/extra',
      ]
    ) {
      expect(
        await createWorkerPageFallback(new Request(`https://worker.test${path}`), {
          isLoggedIn: true,
          userId: UserId.generate(),
        }),
      ).toBeUndefined();
    }
  });

  it('redirects the private messages pages to /sign-in when logged out, without caching', async () => {
    for (const path of ['/messages', '/messages/3kconvo', '/messages/3kconvo/', '/messages/fediverse/WyJhIl0']) {
      const response = await createWorkerPageFallback(new Request(`https://worker.test${path}`));

      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe('/sign-in');
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('does not claim messages paths with extra segments', async () => {
    for (
      const path of [
        '/messages/a/b',
        '/messagesx',
        '/messages/fediverse',
        '/messages/fediverse/',
        '/messages/fediverse/a/b',
      ]
    ) {
      expect(
        await createWorkerPageFallback(new Request(`https://worker.test${path}`), {
          isLoggedIn: true,
          userId: UserId.generate(),
        }),
      ).toBeUndefined();
    }
  });

  it('does not add noindex to public pages', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/about'));

    expect(response?.headers.get('X-Robots-Tag')).toBeNull();
    expect(await response?.text()).not.toContain('name="robots"');
  });

  it('embeds prefetch-only speculation rules that never target /auth or prerender', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/about'));
    const html = (await response?.text()) ?? '';
    const match = /<script type="speculationrules">([^<]*)<\/script>/.exec(html);

    expect(match).not.toBeNull();
    const rules = JSON.parse(match?.[1] ?? '{}') as { prefetch?: { eagerness?: string }[]; prerender?: unknown };
    expect(rules.prerender).toBeUndefined();
    expect(match?.[1]).not.toContain('prerender');
    expect(match?.[1]).not.toContain('/auth');
  });

  it('redirects the private bookmarks page to /sign-in when logged out, without caching', async () => {
    const anonymous = await createWorkerPageFallback(new Request('https://worker.test/bookmarks'));
    const expired = await createWorkerPageFallback(
      new Request('https://worker.test/bookmarks', { headers: { Cookie: 'sessionId=expired' } }),
      { isLoggedIn: false },
    );

    for (const response of [anonymous, expired]) {
      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe('/sign-in');
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(await response?.text()).toBe('');
    }
  });

  it('renders the bookmarks entry for a logged-in user with no-store and noindex', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/bookmarks'), {
      isLoggedIn: true,
      userId: UserId.generate(),
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex');
    const html = await response?.text();
    expect(html).toContain('/static/bookmarks.js');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('redirects the private feeds page to /sign-in when logged out, without caching', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/feeds'));

    expect(response?.status).toBe(302);
    expect(response?.headers.get('Location')).toBe('/sign-in');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not claim feeds paths with extra segments', async () => {
    for (const path of ['/feeds/a', '/feedsx']) {
      expect(
        await createWorkerPageFallback(new Request(`https://worker.test${path}`), {
          isLoggedIn: true,
          userId: UserId.generate(),
        }),
      ).toBeUndefined();
    }
  });

  it('redirects the private settings page to /sign-in when logged out, without caching', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/settings'));

    expect(response?.status).toBe(302);
    expect(response?.headers.get('Location')).toBe('/sign-in');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });

  it('renders the settings entry for a logged-in user with a Japanese title, no-store and noindex', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/settings#profile'), {
      isLoggedIn: true,
      userId: UserId.generate(),
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex');
    const html = await response?.text();
    expect(html).toContain('/static/settings.js');
    expect(html).toContain('<title>設定 | blog.kosui.me</title>');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('does not claim unknown GET routes', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/not-a-page'));
    expect(response).toBeUndefined();
  });
});
