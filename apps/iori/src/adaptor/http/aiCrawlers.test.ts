import { describe, expect, it } from 'vitest';

import { isAiCrawlerUserAgent, isImagePath, renderRobotsTxt } from './aiCrawlers.ts';

describe('isAiCrawlerUserAgent', () => {
  it.each([
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'CCBot/2.0 (https://commoncrawl.org/faq/)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot',
    'gptbot/1.4',
  ])('blocks %s', (userAgent) => {
    expect(isAiCrawlerUserAgent(userAgent)).toBe(true);
  });

  it.each([
    'Mastodon/4.3.2 (http.rb/5.2.0; +https://mastodon.social/)',
    'Misskey/2025.1.0 (https://misskey.io)',
    'Misskey/2025.1.0 (https://gptbot.example)',
    'Mastodon/4.3.2 (http.rb/5.2.0; +https://claudebot.example/)',
    'Bluesky Cardyb/1.1',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Twitterbot/1.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
    'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
    'Mozilla/5.0 (compatible; GoogleOther)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '',
  ])('does not block %s', (userAgent) => {
    expect(isAiCrawlerUserAgent(userAgent)).toBe(false);
  });

  it('does not block a missing user agent', () => {
    expect(isAiCrawlerUserAgent(undefined)).toBe(false);
    expect(isAiCrawlerUserAgent(null)).toBe(false);
  });
});

describe('renderRobotsTxt', () => {
  const robotsTxt = renderRobotsTxt();

  it('disallows only image paths for the listed tokens', () => {
    expect(robotsTxt).toContain('Disallow: /uploads/\n');
    expect(robotsTxt).toContain('Disallow: /*.png$\n');
    expect(robotsTxt.split('\n')).not.toContain('Disallow: /');
  });

  it('allows everything for other user agents', () => {
    expect(robotsTxt).toContain('User-agent: *\nAllow: /\n');
    expect(robotsTxt.endsWith('\n')).toBe(true);
  });
});

describe('isImagePath', () => {
  it.each([
    '/uploads/abc.webp',
    '/uploads/abc.bin',
    '/api/og/articles/1',
    '/default-avatar.png',
    '/favicon.ico',
    '/foo/bar.JPG',
  ])('treats %s as an image path', (path) => {
    expect(isImagePath(path)).toBe(true);
  });

  it.each([
    '/',
    '/users/kosui',
    '/users/kosui/posts/1',
    '/api/v1/media/1',
    '/robots.txt',
    '/uploads',
  ])('does not treat %s as an image path', (path) => {
    expect(isImagePath(path)).toBe(false);
  });
});
