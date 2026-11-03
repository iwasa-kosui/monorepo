import { describe, expect, it } from 'vitest';

import { UserId } from './domain/user/userId.ts';
import { layoutStyle, tailwindConfigScript } from './layoutAssets.ts';
import { createWorkerPageFallback } from './workerPageFallback.ts';
import { renderBottomNav, renderPostModal, renderSidebar } from './workerPageNav.tsx';

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

  it('embeds the tailwind config and the style block shared with LayoutClient', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/about'));
    const html = await response?.text();

    expect(html).toContain(`<script>${tailwindConfigScript}</script>`);
    expect(html).toContain(`<style>${layoutStyle}</style>`);
    expect(html).toContain('terracotta');
    expect(html).toContain('.bg-decoration');
  });

  it('renders the Sidebar, BottomNav and PostModal only when logged in', async () => {
    const loggedIn = await (await createWorkerPageFallback(new Request('https://worker.test/'), {
      isLoggedIn: true,
      userId: UserId.generate(),
    }))?.text();
    const loggedOut = await (await createWorkerPageFallback(new Request('https://worker.test/'), {
      isLoggedIn: false,
    }))?.text();

    expect(loggedIn).toContain(await renderSidebar(true));
    expect(loggedIn).toContain(await renderBottomNav(true));
    expect(loggedIn).toContain(await renderPostModal());
    expect(loggedIn).toContain('<aside class="hidden md:flex fixed left-0 top-0 h-full flex-col p-4">');
    expect(loggedIn).toContain('md:hidden fixed bottom-0 left-0 right-0');
    expect(loggedIn).toContain('id="post-modal"');
    expect(loggedIn).toContain('pb-16 md:pb-0 md:px-16');
    expect(loggedOut).not.toContain('<aside');
    expect(loggedOut).not.toContain('md:hidden fixed bottom-0');
    expect(loggedOut).not.toContain('post-modal');
  });

  it('does not claim unknown GET routes', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/not-a-page'));
    expect(response).toBeUndefined();
  });
});
