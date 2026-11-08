import { describe, expect, it } from 'vitest';

import { XUsername } from '../feedSource/xUsername.ts';
import {
  buildDigestBodies,
  buildSummaryBodies,
  buildXPostsSection,
  type DigestBodyInput,
  type DigestBodyRecommendation,
} from './digestBody.ts';

const input: DigestBodyInput = {
  radar: { title: 'Technology Radar Vol. 34', url: 'https://www.thoughtworks.com/radar' },
  timelineTrends: [{ title: 'Shared link', url: 'https://example.com/shared', count: 3 }],
  hatenaTrends: [{ title: 'Hot entry', url: 'https://example.com/hot', count: 500 }],
};

describe('buildDigestBodies', () => {
  it('private は Radar、iori のタイムライン、はてなブックマークの順に節を並べる', () => {
    const { privateHtml } = buildDigestBodies(input);

    const positions = [
      'Thoughtworks Technology Radar の新しい版',
      'みんなの関心（iori のタイムライン）',
      'みんなの関心（はてなブックマーク）',
    ].map((heading) => privateHtml.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(privateHtml).toContain('<a href="https://example.com/shared">Shared link</a>（3 人が共有）');
    expect(privateHtml).toContain('<a href="https://example.com/hot">Hot entry</a>（500 ブックマーク）');
  });

  it('public には Radar だけを出し、iori のタイムラインとはてなブックマークの節を出さない', () => {
    const { publicHtml, privateHtml } = buildDigestBodies(input);

    expect(privateHtml).toContain('Shared link');
    expect(privateHtml).toContain('Hot entry');
    expect(publicHtml).toContain('Technology Radar Vol. 34');
    expect(publicHtml).not.toContain('Shared link');
    expect(publicHtml).not.toContain('https://example.com/shared');
    expect(publicHtml).not.toContain('Hot entry');
    expect(publicHtml).not.toContain('https://example.com/hot');
    expect(publicHtml).not.toContain('みんなの関心');
    expect(publicHtml).not.toContain('はてなブックマーク');
  });

  it('空の節は見出しごと出さない', () => {
    const { privateHtml, publicHtml } = buildDigestBodies({
      radar: undefined,
      timelineTrends: [],
      hatenaTrends: [{ title: 'Hot', url: 'https://example.com/hot', count: 1 }],
    });

    expect(privateHtml).not.toContain('Radar');
    expect(privateHtml).not.toContain('iori のタイムライン');
    expect(privateHtml).toContain('みんなの関心（はてなブックマーク）');
    expect(publicHtml).toBe('<p>今日のダイジェストに載せる記事はありません。</p>');
  });

  it('材料がなければ、見出しを出さずに載せる記事がない旨の段落だけを返す', () => {
    const bodies = buildDigestBodies({ radar: undefined, timelineTrends: [], hatenaTrends: [] });

    expect(bodies.privateHtml).toBe('<p>今日のダイジェストに載せる記事はありません。</p>');
    expect(bodies.publicHtml).toBe(bodies.privateHtml);
  });

  it('タイトルと要約と URL の HTML をエスケープする', () => {
    const { privateHtml, publicHtml } = buildDigestBodies({
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

    for (const html of [privateHtml, publicHtml]) {
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<b>radar</b>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quote&quot;');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).toContain('href="https://example.com/r?a=1&amp;b=%222%22"');
    }
    expect(privateHtml).toContain('&lt;i&gt;t&lt;/i&gt;');
    expect(privateHtml).toContain('&#39;h&#39;');
  });

  it('https と http 以外の URL にはリンクを付けず、タイトルだけを出す', () => {
    const { privateHtml } = buildDigestBodies({
      radar: { title: 'Radar', url: 'javascript:alert(1)' },
      recommendations: [
        { title: 'Data', url: 'data:text/html,x', summary: null, fromHatena: false, reason: null },
        { title: 'Broken', url: 'not a url', summary: null, fromHatena: false, reason: null },
        { title: 'Plain http', url: 'http://example.com/p', summary: null, fromHatena: false, reason: null },
      ],
      timelineTrends: [{ title: 'File', url: 'file:///etc/passwd', count: 1 }],
      hatenaTrends: [],
    });

    expect(privateHtml).not.toContain('javascript:');
    expect(privateHtml).not.toContain('data:');
    expect(privateHtml).not.toContain('file:');
    expect(privateHtml).toContain('<li>Radar</li>');
    expect(privateHtml).toContain('<li>Data</li>');
    expect(privateHtml).toContain('<li>Broken</li>');
    expect(privateHtml).toContain('<a href="http://example.com/p">Plain http</a>');
  });

  it('件数が 0 のブックマークと共有には件数を出さない', () => {
    const { privateHtml } = buildDigestBodies({
      radar: undefined,
      timelineTrends: [],
      hatenaTrends: [{ title: 'Zero', url: 'https://example.com/z', count: 0 }],
    });

    expect(privateHtml).toContain('<li><a href="https://example.com/z">Zero</a></li>');
  });
});

describe('buildDigestBodies: あなたへのおすすめ', () => {
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

  it('private は要約の下に関心の根拠の行を出し、おすすめの節を Radar の次に置く', () => {
    const { privateHtml } = buildDigestBodies(withRecommendations);

    expect(privateHtml).toContain(
      '<a href="https://example.com/k">Kosui based</a><br>要約K<br>関心の根拠: '
        + '<a href="https://kosui.me/posts/a">https://kosui.me/posts/a</a>',
    );
    expect(privateHtml).toContain('<a href="https://example.com/h">Hatena based</a><br>関心の根拠: ');
    expect(privateHtml).toContain('<a href="https://example.com/p">Post based</a><br>要約P<br>関心の根拠: iori の投稿');
    expect(privateHtml).toContain('<li><a href="https://example.com/n">No reason</a></li>');
    const positions = ['Thoughtworks Technology Radar', '<h2>あなたへのおすすめ</h2>', 'みんなの関心（iori']
      .map((heading) => privateHtml.indexOf(heading));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((position) => position >= 0)).toBe(true);
  });

  it('public ははてな由来の記事を除き、iori の投稿といいねの根拠の行を消し、kosui.me の根拠の行は残す', () => {
    const { publicHtml } = buildDigestBodies({
      ...withRecommendations,
      recommendations: [
        ...recommendations,
        {
          title: 'Like based',
          url: 'https://example.com/l',
          summary: null,
          fromHatena: false,
          reason: { scope: 'own', label: 'iori のいいね' },
        },
      ],
    });

    expect(publicHtml).toContain('<h2>あなたへのおすすめ</h2>');
    expect(publicHtml).toContain('Kosui based');
    expect(publicHtml).toContain('<a href="https://kosui.me/posts/a">https://kosui.me/posts/a</a>');
    expect(publicHtml).toContain('<a href="https://example.com/p">Post based</a><br>要約P</li>');
    expect(publicHtml).toContain('<li><a href="https://example.com/l">Like based</a></li>');
    expect(publicHtml).not.toContain('Hatena based');
    expect(publicHtml).not.toContain('https://kosui.me/posts/b');
    expect(publicHtml).not.toContain('iori の投稿');
    expect(publicHtml).not.toContain('iori のいいね');
    expect(publicHtml).not.toContain('はてなブックマーク');
  });

  it('public のおすすめがすべてはてな由来なら、おすすめの節を出さない', () => {
    const { publicHtml } = buildDigestBodies({ ...withRecommendations, recommendations: [recommendations[1]!] });

    expect(publicHtml).not.toContain('あなたへのおすすめ');
  });

  it('根拠のラベルとリンクをエスケープし、http と https 以外の URL にはリンクを付けない', () => {
    const { privateHtml } = buildDigestBodies({
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

    expect(privateHtml).toContain('関心の根拠: &lt;b&gt;x&lt;/b&gt;');
    expect(privateHtml).not.toContain('javascript:');
  });
});

describe('buildSummaryBodies', () => {
  const summaryInput = {
    radar: { title: 'Technology Radar Vol. 34', url: 'https://www.thoughtworks.com/radar' },
    topics: [
      { name: '生成 AI とエージェント', articleId: '0198f0f0-0000-7000-8000-000000000001' },
      { name: 'セキュリティ <特集>', articleId: '0198f0f0-0000-7000-8000-000000000002' },
    ],
    timelineTrends: [{ title: 'Shared link', url: 'https://example.com/shared', count: 3 }],
    hatenaTrends: [{ title: 'Hot entry', url: 'https://example.com/hot', count: 500 }],
  };

  it('private は Radar、トピックの記事へのリンク、iori のタイムライン、はてなブックマークの順に節を並べる', () => {
    const { privateHtml } = buildSummaryBodies(summaryInput);

    const positions = [
      'Thoughtworks Technology Radar の新しい版',
      '<h2>トピック別のダイジェスト</h2>',
      'みんなの関心（iori のタイムライン）',
      'みんなの関心（はてなブックマーク）',
    ].map((heading) => privateHtml.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('トピックの記事への内部リンクを出し、名前を HTML エスケープする', () => {
    const { privateHtml } = buildSummaryBodies(summaryInput);

    expect(privateHtml).toContain(
      '<a href="/articles/0198f0f0-0000-7000-8000-000000000001">生成 AI とエージェント</a>',
    );
    expect(privateHtml).toContain(
      '<a href="/articles/0198f0f0-0000-7000-8000-000000000002">セキュリティ &lt;特集&gt;</a>',
    );
  });

  it('public には Radar もトレンドもトピックも出さず、公開を想定しない旨だけを出す', () => {
    const { publicHtml } = buildSummaryBodies(summaryInput);

    expect(publicHtml).toBe('<p>このまとめは公開を想定していません。</p>');
  });

  it('トピックが無ければ、トピックの節を出さない', () => {
    const { privateHtml } = buildSummaryBodies({ ...summaryInput, topics: [] });

    expect(privateHtml).not.toContain('トピック別のダイジェスト');
    expect(privateHtml).toContain('Shared link');
  });

  it('材料もトピックも無ければ、載せる記事がない旨の段落だけを返す', () => {
    const { privateHtml } = buildSummaryBodies({ radar: undefined, topics: [], timelineTrends: [], hatenaTrends: [] });

    expect(privateHtml).toBe('<p>今日のダイジェストに載せる記事はありません。</p>');
  });

  it('X の投稿の節を、private にも public にも入れない', () => {
    expect(buildSummaryBodies(summaryInput).privateHtml).not.toContain('X の投稿');
    expect(buildSummaryBodies(summaryInput).publicHtml).toBe('<p>このまとめは公開を想定していません。</p>');
  });
});

describe('buildXPostsSection', () => {
  const xPosts = [
    { username: XUsername.orThrow('jack'), title: 'secret <b>post</b>', url: 'https://x.com/jack/status/111' },
    { username: XUsername.orThrow('sundar'), title: 'another post', url: 'https://x.com/sundar/status/222' },
  ];

  it('見出しの下に、ユーザー名とリンクを並べ、本文を HTML エスケープする', () => {
    expect(buildXPostsSection(xPosts)).toBe(
      '<h2>X の投稿</h2><ul>'
        + '<li>@jack <a href="https://x.com/jack/status/111">secret &lt;b&gt;post&lt;/b&gt;</a></li>'
        + '<li>@sundar <a href="https://x.com/sundar/status/222">another post</a></li>'
        + '</ul>',
    );
  });

  it('http と https 以外の URL はリンクにしない', () => {
    const [post] = xPosts;

    expect(buildXPostsSection([{ ...post!, url: 'javascript:alert(1)' }])).toContain('@jack secret &lt;b&gt;');
    expect(buildXPostsSection([{ ...post!, url: 'javascript:alert(1)' }])).not.toContain('href');
  });

  it('投稿が無ければ、見出しごと空にする', () => {
    expect(buildXPostsSection([])).toBe('');
  });
});
