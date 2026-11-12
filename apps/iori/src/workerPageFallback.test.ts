import { describe, expect, it } from 'vitest';

import { UserId } from './domain/user/userId.ts';
import { layoutStyle, tailwindConfigScript } from './layoutAssets.ts';
import { createWorkerPageFallback } from './workerPageFallback.ts';
import { renderBottomNav, renderSidebar } from './workerPageNav.tsx';

describe('createWorkerPageFallback', () => {
  it('renders mapped client entries and the resolved session identity', async () => {
    const userId = UserId.generate();
    const response = await createWorkerPageFallback(
      new Request('https://worker.test/users/kosui/posts/01989332-d1c1-7dd1-9ed7-886b8857dffa'),
      { isLoggedIn: true, userId },
    );

    expect(response?.status).toBe(200);
    const html = await response?.text();
    expect(html).toContain('/static/localPost.js');
    expect(html).toContain('data-is-logged-in="true"');
    expect(html).toContain(`data-user-id="${userId}"`);
  });

  it.each([
    '/posts/01989332-d1c1-7dd1-9ed7-886b8857dffa',
    '/posts/01989332-d1c1-7dd1-9ed7-886b8857dffa/',
  ])('renders the post entry for %s without a username', async (path) => {
    const response = await createWorkerPageFallback(new Request(`https://worker.test${path}`));

    expect(response?.status).toBe(200);
    const html = await response?.text();
    expect(html).toContain('/static/localPost.js');
    expect(html).toContain('<title>Post | blog.kosui.me</title>');
  });

  it.each(['/posts', '/posts/a/b'])('does not render a page for %s', async (path) => {
    expect(await createWorkerPageFallback(new Request(`https://worker.test${path}`))).toBeUndefined();
  });

  it('renders the sign-in entry when the query carries a next path', async () => {
    const response = await createWorkerPageFallback(
      new Request('https://worker.test/sign-in?next=%2Foauth%2Fauthorize%3Fclient_id%3Dabc'),
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain('/static/signIn.js');
  });

  it('renders the search entry with a Japanese title', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/search'));

    expect(response?.status).toBe(200);
    const html = await response?.text();
    expect(html).toContain('/static/search.js');
    expect(html).toContain('<title>検索 | blog.kosui.me</title>');
  });

  it('embeds the tailwind config and the style block shared with LayoutClient', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/about'));
    const html = await response?.text();

    expect(html).toContain(`<script>${tailwindConfigScript}</script>`);
    expect(html).toContain(`<style>${layoutStyle}</style>`);
    expect(html).toContain('terracotta');
    expect(html).toContain('.bg-decoration');
  });

  it('renders the Sidebar and BottomNav only when logged in, without a static post modal', async () => {
    const loggedIn = await (await createWorkerPageFallback(new Request('https://worker.test/'), {
      isLoggedIn: true,
      userId: UserId.generate(),
    }))?.text();
    const loggedOut = await (await createWorkerPageFallback(new Request('https://worker.test/'), {
      isLoggedIn: false,
    }))?.text();

    expect(loggedIn).toContain(await renderSidebar(true));
    expect(loggedIn).toContain(await renderBottomNav(true));
    expect(loggedIn).toContain('<aside class="hidden md:flex fixed left-0 top-0 h-full flex-col p-4">');
    expect(loggedIn).toContain('md:hidden fixed bottom-0 left-0 right-0');
    expect(loggedIn).toContain('href="/#post-modal"');
    expect(loggedIn).not.toContain('id="post-modal"');
    expect(loggedIn).not.toContain('action="/posts"');
    expect(loggedIn).toContain('pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 md:px-16');
    expect(loggedOut).not.toContain('<aside');
    expect(loggedOut).not.toContain('md:hidden fixed bottom-0');
    expect(loggedOut).not.toContain('post-modal');
  });

  it('shows the digest link in the Sidebar only when logged in and keeps it out of the BottomNav', async () => {
    const loggedIn = await renderSidebar(true);
    const loggedOut = await renderSidebar(false);

    expect(loggedIn).toContain('href="/digest"');
    expect(loggedIn.indexOf('href="/digest"')).toBeLessThan(loggedIn.indexOf('href="/articles"'));
    expect(loggedOut).not.toContain('href="/digest"');
    expect(await renderBottomNav(true)).not.toContain('/digest');
  });

  it('orders the BottomNav items as home, notifications, then the post button', async () => {
    const html = await renderBottomNav(true);
    const home = html.indexOf('href="/"');
    const notifications = html.indexOf('href="/notifications"');
    const post = html.indexOf('href="/#post-modal"');

    expect(home).toBeGreaterThanOrEqual(0);
    expect(notifications).toBeGreaterThan(home);
    expect(post).toBeGreaterThan(notifications);
  });

  it('renders a hidden notification badge in both navs and loads the badge script', async () => {
    const html = await (await createWorkerPageFallback(new Request('https://worker.test/'), {
      isLoggedIn: true,
      userId: UserId.generate(),
    }))?.text();

    for (const nav of [await renderSidebar(true), await renderBottomNav(true)]) {
      const notifications = nav.indexOf('href="/notifications"');
      const badge = nav.indexOf('data-notification-badge');
      expect(badge).toBeGreaterThan(notifications);
      expect(nav).toMatch(/<span data-notification-badge="true" hidden="" /);
    }
    expect(html).toContain('<script type="module" src="/static/notificationBadge.js"></script>');
  });

  it('keeps the BottomNav below page modals and inside the bottom safe area', async () => {
    const html = await renderBottomNav(true);

    expect(html).toContain('z-40');
    expect(html).not.toContain('z-50');
    expect(html).toContain('pb-[env(safe-area-inset-bottom)]');
  });

  it('declares viewport-fit=cover in the logged-in fallback HTML', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/'), {
      isLoggedIn: true,
      userId: UserId.generate(),
    });
    const html = await response?.text();

    expect(html).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/);
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

  it('renders the private X page for a logged-in user with no-store and noindex', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/x'), {
      isLoggedIn: true,
      userId: UserId.generate(),
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex');
    const html = await response?.text();
    expect(html).toContain('/static/xPosts.js');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('redirects the private Bluesky profile page to /sign-in when logged out, without caching', async () => {
    for (const path of ['/bluesky/profile/did%3Aplc%3Aalice', '/bluesky/profile/alice.bsky.social/']) {
      const response = await createWorkerPageFallback(new Request(`https://worker.test${path}`));

      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe('/sign-in');
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('renders the Bluesky profile entry for a logged-in user with no-store and noindex', async () => {
    const response = await createWorkerPageFallback(
      new Request('https://worker.test/bluesky/profile/did%3Aplc%3Aalice'),
      { isLoggedIn: true, userId: UserId.generate() },
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex');
    const html = await response?.text();
    expect(html).toContain('/static/blueskyProfile.js');
    expect(html).toContain('<meta name="robots" content="noindex">');
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

  it('renders the federated timeline for a logged-in user', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/federated'), {
      isLoggedIn: true,
      userId: UserId.generate(),
    });

    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain('/static/federatedTimeline.js');
  });

  it('does not add noindex to public pages', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/about'));

    expect(response?.headers.get('X-Robots-Tag')).toBeNull();
    expect(await response?.text()).not.toContain('name="robots"');
  });

  it('shows the X link in the Sidebar only when logged in and keeps it out of the BottomNav', async () => {
    const loggedIn = await renderSidebar(true);
    const loggedOut = await renderSidebar(false);

    expect(loggedIn).toContain('href="/x"');
    expect(loggedIn.indexOf('href="/x"')).toBeGreaterThan(loggedIn.indexOf('href="/digest"'));
    expect(loggedIn.indexOf('href="/x"')).toBeLessThan(loggedIn.indexOf('href="/articles"'));
    expect(loggedOut).not.toContain('href="/x"');
    expect(await renderBottomNav(true)).not.toContain('href="/x"');
  });

  it('embeds prefetch-only speculation rules that never target /auth or prerender', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/about'));
    const html = (await response?.text()) ?? '';
    const match = /<script type="speculationrules">([^<]*)<\/script>/.exec(html);

    expect(match).not.toBeNull();
    const rules = JSON.parse(match?.[1] ?? '{}') as { prefetch?: { eagerness?: string }[]; prerender?: unknown };
    expect(rules.prerender).toBeUndefined();
    expect(rules.prefetch?.[0]?.eagerness).toBe('moderate');
    expect(match?.[1]).not.toContain('prerender');
    expect(match?.[1]).not.toContain('/auth');
    expect(match?.[1]).toContain('"selector_matches":"aside nav a, body > nav a"');
    expect(html).toContain('<script type="module" src="/static/navPrefetch.js"></script>');
  });

  it('does not claim unknown GET routes', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/not-a-page'));
    expect(response).toBeUndefined();
  });
});
