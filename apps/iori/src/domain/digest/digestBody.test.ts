import { describe, expect, it } from 'vitest';

import { XUsername } from '../feedSource/xUsername.ts';
import {
  buildSummaryDmHtml,
  buildTopicDmHtml,
  buildXPostsDmHtml,
  type DigestBodyInput,
  type DigestBodyRecommendation,
} from './digestBody.ts';

const input: DigestBodyInput = {
  radar: { title: 'Technology Radar Vol. 34', url: 'https://www.thoughtworks.com/radar' },
  timelineTrends: [{ title: 'Shared link', url: 'https://example.com/shared', count: 3 }],
  hatenaTrends: [{ title: 'Hot entry', url: 'https://example.com/hot', count: 500 }],
};

const topicHtml = (override: Partial<Parameters<typeof buildTopicDmHtml>[0]> = {}) =>
  buildTopicDmHtml({ topicName: 'トピック', ...input, ...override });

describe('buildTopicDmHtml', () => {
  it('トピック名の見出しと、タイムラインとはてなブックマークの節を出す', () => {
    const html = topicHtml({ topicName: '生成 AI <特集>' });

    expect(html).toContain('<h1>生成 AI &lt;特集&gt;</h1>');
    expect(html).toContain('Technology Radar Vol. 34');
    expect(html).toContain('Shared link');
    expect(html).toContain('Hot entry');
  });

  it('タイトルと要約と URL の HTML をエスケープする', () => {
    const html = topicHtml({
      radar: { title: '<b>radar</b>', url: 'https://example.com/r?a=1&b="2"' },
      recommendations: [{
        title: '<script>alert(1)</script> & "quote"',
        url: 'https://example.com/a',
        summary: '<img src=x onerror=alert(1)>',
        fromHatena: false,
        reason: null,
      }],
      timelineTrends: [{ title: '<i>t</i>', url: 'https://example.com/t', count: 2 }],
      hatenaTrends: [{ title: '\'h\'', url: 'https://example.com/h', count: 2 }],
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>radar</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quote&quot;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('href="https://example.com/r?a=1&amp;b=%222%22"');
    expect(html).toContain('&lt;i&gt;t&lt;/i&gt;');
    expect(html).toContain('&#39;h&#39;');
  });

  it('https と http 以外の URL にはリンクを付けず、タイトルだけを出す', () => {
    const html = topicHtml({
      radar: { title: 'Radar', url: 'javascript:alert(1)' },
      recommendations: [
        { title: 'Data', url: 'data:text/html,x', summary: null, fromHatena: false, reason: null },
        { title: 'Broken', url: 'not a url', summary: null, fromHatena: false, reason: null },
        { title: 'Plain http', url: 'http://example.com/p', summary: null, fromHatena: false, reason: null },
      ],
      timelineTrends: [{ title: 'File', url: 'file:///etc/passwd', count: 1 }],
      hatenaTrends: [],
    });

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:');
    expect(html).not.toContain('file:');
    expect(html).toContain('<li>Radar</li>');
    expect(html).toContain('<li>Data</li>');
    expect(html).toContain('<li>Broken</li>');
    expect(html).toContain('<a href="http://example.com/p">Plain http</a>');
  });
});

describe('buildTopicDmHtml: あなたへのおすすめ', () => {
  const recommendations: ReadonlyArray<DigestBodyRecommendation> = [
    {
      title: 'Kosui based',
      url: 'https://example.com/k',
      summary: '要約K',
      fromHatena: false,
      reason: { scope: 'kosui', label: 'https://kosui.me/posts/a', url: 'https://kosui.me/posts/a' },
    },
    {
      title: 'Hatena based',
      url: 'https://example.com/h',
      summary: null,
      fromHatena: true,
      reason: { scope: 'kosui', label: 'https://kosui.me/posts/b', url: 'https://kosui.me/posts/b' },
    },
    {
      title: 'Post based',
      url: 'https://example.com/p',
      summary: '要約P',
      fromHatena: false,
      reason: { scope: 'own', label: 'iori の投稿' },
    },
    { title: 'No reason', url: 'https://example.com/n', summary: null, fromHatena: false, reason: null },
  ];
  const withRecommendations: DigestBodyInput = { ...input, recommendations };

  it('はてな由来の記事と、iori の投稿の根拠の行も含めて出す', () => {
    const html = topicHtml(withRecommendations);

    expect(html).toContain('<h2>あなたへのおすすめ</h2>');
    expect(html).toContain('Hatena based');
    expect(html).toContain('<a href="https://kosui.me/posts/a">https://kosui.me/posts/a</a>');
    expect(html).toContain('<a href="https://example.com/p">Post based</a><br>要約P<br>関心の根拠: iori の投稿</li>');
  });

  it('根拠のラベルとリンクをエスケープし、http と https 以外の URL にはリンクを付けない', () => {
    const html = topicHtml({
      ...withRecommendations,
      recommendations: [
        {
          title: 'A',
          url: 'https://example.com/a',
          summary: null,
          fromHatena: false,
          reason: { scope: 'kosui', label: '<b>x</b>', url: 'javascript:alert(1)' },
        },
      ],
    });

    expect(html).toContain('関心の根拠: &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('javascript:');
  });
});

describe('buildSummaryDmHtml', () => {
  const summaryInput = {
    radar: { title: 'Technology Radar Vol. 34', url: 'https://www.thoughtworks.com/radar' },
    topics: [{ name: '生成 AI とエージェント' }, { name: 'セキュリティ <特集>' }],
    timelineTrends: [{ title: 'Shared link', url: 'https://example.com/shared', count: 3 }],
    hatenaTrends: [{ title: 'Hot entry', url: 'https://example.com/hot', count: 500 }],
  };

  it('トピック別の節は、相対リンクを出さず、エスケープしたトピック名だけを並べる', () => {
    const html = buildSummaryDmHtml(summaryInput);

    expect(html).toContain('<ul><li>生成 AI とエージェント</li><li>セキュリティ &lt;特集&gt;</li></ul>');
    expect(html).not.toContain('/articles/');
    expect(html).not.toMatch(/href="\//);
  });

  it('X の投稿の節を入れない', () => {
    expect(buildSummaryDmHtml(summaryInput)).not.toContain('X の投稿');
  });
});

describe('buildXPostsDmHtml', () => {
  const xPosts = [
    { username: XUsername.orThrow('jack'), title: 'secret <b>post</b>', url: 'https://x.com/jack/status/111' },
    { username: XUsername.orThrow('sundar'), title: 'another post', url: 'https://x.com/sundar/status/222' },
  ];

  it('X の投稿の節だけを出し、タイトルをエスケープする', () => {
    const html = buildXPostsDmHtml(xPosts);

    expect(html).toContain('<h2>X の投稿</h2>');
    expect(html).toContain('@jack <a href="https://x.com/jack/status/111">secret &lt;b&gt;post&lt;/b&gt;</a>');
    expect(html).not.toContain('<b>');
  });

  it('http と https 以外の URL はリンクにしない', () => {
    const [post] = xPosts;

    expect(buildXPostsDmHtml([{ ...post!, url: 'javascript:alert(1)' }])).toContain('@jack secret &lt;b&gt;');
    expect(buildXPostsDmHtml([{ ...post!, url: 'javascript:alert(1)' }])).not.toContain('href');
  });
});
