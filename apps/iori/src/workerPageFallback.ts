type WorkerPage = Readonly<{
  entry: string;
  title: string;
}>;

export type WorkerPageIdentity = Readonly<{
  isLoggedIn: boolean;
  userId?: string;
}>;

const staticPages = new Map<string, WorkerPage>([
  ['/', { entry: 'home', title: 'blog.kosui.me' }],
  ['/about', { entry: 'about', title: 'About | blog.kosui.me' }],
  ['/articles', { entry: 'articles', title: 'Articles | blog.kosui.me' }],
  ['/federated', { entry: 'federatedTimeline', title: 'Federated timeline | blog.kosui.me' }],
  ['/follow', { entry: 'follow', title: 'Follow | blog.kosui.me' }],
  ['/likes', { entry: 'likedPosts', title: 'Liked posts | blog.kosui.me' }],
  ['/notifications', { entry: 'notifications', title: 'Notifications | blog.kosui.me' }],
  ['/sign-in', { entry: 'signIn', title: 'Sign in | blog.kosui.me' }],
  ['/sign-up', { entry: 'signUp', title: 'Sign up | blog.kosui.me' }],
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
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" content="#1a1918">
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="A microblog by kosui">
    <link rel="icon" href="/favicon.ico">
    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" href="/icon-192.png">
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module" src="/static/${page.entry}.js"></script>
  </head>
  <body class="bg-[#f0eee9] dark:bg-gray-900 min-h-screen text-[#5a5450] dark:text-gray-100">
    <main class="max-w-2xl mx-auto px-6 py-8">
      <div id="root" class="h-full flex flex-col" data-is-logged-in="${String(isLoggedIn)}" data-user-id="${
    escapeHtml(identity?.userId ?? '')
  }"></div>
    </main>
  </body>
</html>`;
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-store',
    },
  });
};
