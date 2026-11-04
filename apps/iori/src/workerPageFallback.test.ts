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

  it('does not claim unknown GET routes', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/not-a-page'));
    expect(response).toBeUndefined();
  });
});
