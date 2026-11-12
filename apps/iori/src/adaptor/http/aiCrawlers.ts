import { createMiddleware } from 'hono/factory';

export const AI_CRAWLER_ROBOTS_TOKENS: readonly string[] = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'Claude-Agent',
  'anthropic-ai',
  'Claude-Web',
  'Google-Extended',
  'Google-CloudVertexBot',
  'Applebot-Extended',
  'meta-externalagent',
  'meta-externalfetcher',
  'meta-webindexer',
  'PerplexityBot',
  'Perplexity-User',
  'CCBot',
  'Amazonbot',
  'Amzn-User',
  'Amzn-SearchBot',
  'MistralAI-User',
  'MistralAI-Training',
  'MistralAI-Index',
  'DuckAssistBot',
  'AI2Bot',
  'Diffbot',
  'Diffbot-User',
  'Bytespider',
  'Coherebot',
  'cohere-ai',
  'cohere-training-data-crawler',
];

// Google-Extended と Applebot-Extended は robots.txt 専用の token で、UA には現れない
export const AI_CRAWLER_USER_AGENT_TOKENS: readonly string[] = AI_CRAWLER_ROBOTS_TOKENS.filter(
  (token) => token !== 'Google-Extended' && token !== 'Applebot-Extended',
);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const AI_CRAWLER_USER_AGENT_PATTERN = new RegExp(
  `(?<![A-Za-z0-9-])(?:${AI_CRAWLER_USER_AGENT_TOKENS.map(escapeRegExp).join('|')})(?=[/;\\s)]|$)`,
  'i',
);

export const isAiCrawlerUserAgent = (userAgent: string | undefined | null): boolean =>
  userAgent !== undefined && userAgent !== null && AI_CRAWLER_USER_AGENT_PATTERN.test(userAgent);

const IMAGE_PATH_PREFIXES: readonly string[] = ['/uploads/', '/api/og/'];

const IMAGE_PATHS: readonly string[] = [
  '/default-avatar.png',
  '/default-header.png',
];

const IMAGE_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'bmp',
  'heic',
];

export const isImagePath = (path: string): boolean => {
  if (IMAGE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  if (IMAGE_PATHS.includes(path)) {
    return true;
  }
  const lowerPath = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lowerPath.endsWith(`.${extension}`));
};

export const renderRobotsTxt = (): string =>
  [
    ...AI_CRAWLER_ROBOTS_TOKENS.map((token) => `User-agent: ${token}`),
    ...IMAGE_PATH_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    ...IMAGE_PATHS.map((path) => `Disallow: ${path}`),
    ...IMAGE_EXTENSIONS.map((extension) => `Disallow: /*.${extension}$`),
    '',
    'User-agent: *',
    'Allow: /',
    '',
  ].join('\n');

const TEXT_PLAIN = 'text/plain; charset=utf-8';

const forbidden = (): Response => new Response('Forbidden', { status: 403, headers: { 'Content-Type': TEXT_PLAIN } });

export const aiCrawlerGuard = createMiddleware(async (c, next) => {
  if ((c.req.method === 'GET' || c.req.method === 'HEAD') && c.req.path === '/robots.txt') {
    return c.body(renderRobotsTxt(), 200, {
      'Content-Type': TEXT_PLAIN,
      'Cache-Control': 'public, max-age=3600',
    });
  }
  if (!isAiCrawlerUserAgent(c.req.header('user-agent'))) {
    await next();
    return;
  }
  if (isImagePath(c.req.path)) {
    return forbidden();
  }
  await next();
  if (c.res.headers.get('content-type')?.toLowerCase().startsWith('image/') === true) {
    await c.res.body?.cancel();
    c.res = forbidden();
  }
});
