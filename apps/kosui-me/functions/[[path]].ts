type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
};

const generateOgpTags = (url: URL, pathname: string): string => {
  const siteUrl = url.origin;
  const isPost = pathname.startsWith('/posts/');

  const title = 'kosui';
  const description = 'kosuiの技術ブログ。TypeScript, Node.js, インフラなどの知見を発信しています。';
  let ogImageUrl = `${siteUrl}/og/default.png`;

  if (isPost) {
    const slugFileName = pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
    ogImageUrl = `${siteUrl}/og/${slugFileName}.png`;
  }

  const ogUrl = siteUrl + pathname;

  return `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="${isPost ? 'article' : 'website'}" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:site_name" content="kosui" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
  `;
};

type EventContext = {
  request: Request;
  env: Env;
};

export const onRequest = async (context: EventContext): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);

  const assetExtensions = [
    '.js',
    '.css',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.xml',
  ];
  if (assetExtensions.some((ext) => url.pathname.endsWith(ext))) {
    return env.ASSETS.fetch(request);
  }

  const userAgent = request.headers.get('user-agent') || '';
  const isCrawler = /bot|crawl|spider|slurp|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|WhatsApp|TelegramBot/i
    .test(userAgent);

  if (!isCrawler) {
    return env.ASSETS.fetch(request);
  }

  const response = await env.ASSETS.fetch(new Request(url.origin + '/', request));
  const html = await response.text();

  const ogpTags = generateOgpTags(url, url.pathname);
  const modifiedHtml = html.replace('</head>', `${ogpTags}</head>`);

  return new Response(modifiedHtml, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      'content-type': 'text/html;charset=UTF-8',
    },
  });
};
