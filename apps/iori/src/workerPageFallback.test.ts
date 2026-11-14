import { describe, expect, it } from 'vitest';

import { UserId } from './domain/user/userId.ts';
import { createWorkerPageFallback } from './workerPageFallback.ts';

const loggedIn = () => ({ isLoggedIn: true, userId: UserId.generate() });

describe('createWorkerPageFallback', () => {
  it.each([
    '/x',
    '/federated',
    '/bookmarks',
    '/settings',
    '/messages/3kconvo/',
    '/messages/fediverse/WyJhIl0',
    '/bluesky/profile/alice.bsky.social/',
    '/bluesky/profile/did:plc:abc/post/3kxyz',
  ])('redirects the private page %s to /sign-in when logged out, without caching', async (path) => {
    const response = await createWorkerPageFallback(new Request(`https://worker.test${path}`));

    expect(response?.status).toBe(302);
    expect(response?.headers.get('Location')).toBe('/sign-in');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(await response?.text()).toBe('');
  });

  it('redirects a private page for an expired session cookie', async () => {
    const response = await createWorkerPageFallback(
      new Request('https://worker.test/x', { headers: { Cookie: 'sessionId=expired' } }),
      { isLoggedIn: false },
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get('Location')).toBe('/sign-in');
  });

  it.each(['/bookmarks', '/settings', '/bluesky/profile/did:plc:abc/post/3kxyz'])(
    'renders the private page %s for a logged-in user with no-store and noindex',
    async (path) => {
      const response = await createWorkerPageFallback(new Request(`https://worker.test${path}`), loggedIn());

      expect(response?.status).toBe(200);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(response?.headers.get('X-Robots-Tag')).toBe('noindex');
      expect(await response?.text()).toContain('<meta name="robots" content="noindex">');
    },
  );

  it.each([
    '/posts',
    '/posts/a/b',
    '/not-a-page',
    '/bluesky/profile/',
    '/bluesky/profile/a/b',
    '/bluesky/profile/alice.bsky.social/post/3kxyz',
    '/bluesky/profile/did:plc:abc/post/3kxyz/extra',
    '/messages/a/b',
    '/messagesx',
    '/messages/fediverse/',
    '/feeds/a',
  ])('does not claim %s', async (path) => {
    expect(await createWorkerPageFallback(new Request(`https://worker.test${path}`), loggedIn())).toBeUndefined();
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
});
