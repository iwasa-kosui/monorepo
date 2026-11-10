import { layoutStyle, tailwindConfigScript } from './layoutAssets.ts';
import { speculationRulesScript } from './ui/api/speculationRules.ts';
import { renderBottomNav, renderSidebar } from './workerPageNav.tsx';

export const SITE_DESCRIPTION = 'A microblog by kosui';

type WorkerPage = Readonly<{
  entry: string;
  title: string;
  private?: boolean;
}>;

export type WorkerPageIdentity = Readonly<{
  isLoggedIn: boolean;
  userId?: string;
}>;

const staticPages = new Map<string, WorkerPage>([
  ['/', { entry: 'home', title: 'blog.kosui.me' }],
  ['/about', { entry: 'about', title: 'About | blog.kosui.me' }],
  ['/articles', { entry: 'articles', title: 'Articles | blog.kosui.me' }],
  ['/federated', { entry: 'federatedTimeline', title: 'Federated timeline | blog.kosui.me', private: true }],
  ['/follow', { entry: 'follow', title: 'Follow | blog.kosui.me' }],
  ['/likes', { entry: 'likedPosts', title: 'Liked posts | blog.kosui.me' }],
  ['/notifications', { entry: 'notifications', title: 'Notifications | blog.kosui.me' }],
  ['/search', { entry: 'search', title: '検索 | blog.kosui.me' }],
  ['/sign-in', { entry: 'signIn', title: 'Sign in | blog.kosui.me' }],
  ['/sign-up', { entry: 'signUp', title: 'Sign up | blog.kosui.me' }],
  ['/x', { entry: 'xPosts', title: 'X | blog.kosui.me', private: true }],
]);

const pageForPath = (pathname: string): WorkerPage | undefined => {
  const exact = staticPages.get(pathname);
  if (exact !== undefined) return exact;
  if (/^\/remote-users\/[^/]+\/?$/.test(pathname)) {
    return { entry: 'remoteUser', title: 'Profile | blog.kosui.me' };
  }
  if (/^\/users\/[^/]+\/posts\/[^/]+\/?$/.test(pathname)) {
    return { entry: 'localPost', title: 'Post | blog.kosui.me' };
  }
  if (/^\/users\/[^/]+\/articles\/[^/]+\/?$/.test(pathname) || /^\/articles\/[^/]+\/?$/.test(pathname)) {
    return { entry: 'articleDetail', title: 'Article | blog.kosui.me' };
  }
  if (/^\/users\/[^/]+\/?$/.test(pathname)) {
    return { entry: 'localUser', title: 'Profile | blog.kosui.me' };
  }
  return undefined;
};

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export const createWorkerPageFallback = async (
  request: Request,
  identity?: WorkerPageIdentity,
): Promise<Response | undefined> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
  const page = pageForPath(new URL(request.url).pathname);
  if (page === undefined) return undefined;
  const isLoggedIn = identity?.isLoggedIn ?? /(?:^|;\s*)sessionId=/.test(request.headers.get('Cookie') ?? '');
  if (page.private === true && !isLoggedIn) {
    return new Response(null, { status: 302, headers: { Location: '/sign-in', 'Cache-Control': 'no-store' } });
  }
  const [sidebar, bottomNav] = isLoggedIn
    ? await Promise.all([renderSidebar(isLoggedIn), renderBottomNav(isLoggedIn)])
    : ['', ''];
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="light dark">
    <link rel="icon" href="/favicon.ico">
    <link rel="manifest" href="/manifest.json">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="iori">
    <link rel="apple-touch-icon" href="/icon-192.png">
    <meta name="theme-color" content="#1a1918">
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${SITE_DESCRIPTION}">${
    page.private === true ? '\n    <meta name="robots" content="noindex">' : ''
  }
    <script src="https://cdn.tailwindcss.com"></script>
    <style>${layoutStyle}</style>
    <script>${tailwindConfigScript}</script>
    ${speculationRulesScript()}
    <script type="module" src="/static/${page.entry}.js"></script>
    <script type="module" src="/static/navPrefetch.js"></script>
    <script type="module" src="/static/notificationBadge.js"></script>
  </head>
  <body class="bg-clay-bg dark:bg-gray-900 min-h-screen text-charcoal dark:text-gray-100 ${
    isLoggedIn ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 md:px-16' : ''
  }">
    <div class="bg-decoration" aria-hidden="true">
      <div class="bg-blob bg-blob-1"></div>
      <div class="bg-blob bg-blob-2"></div>
      <div class="bg-blob bg-blob-3"></div>
    </div>
    ${sidebar}
    <main class="max-w-2xl mx-auto px-6 py-8 relative">
      <div id="root" class="h-full flex flex-col" data-is-logged-in="${String(isLoggedIn)}" data-user-id="${
    escapeHtml(identity?.userId ?? '')
  }"></div>
    </main>
    ${bottomNav}
  </body>
</html>`;
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-store',
      ...(page.private === true ? { 'X-Robots-Tag': 'noindex' } : {}),
    },
  });
};
