import { describe, expect, it } from 'vitest';

import { StructuredData } from './structuredData';

describe('StructuredData.blogPosting', () => {
  const article = {
    url: 'https://kosui.me/posts/2026/01/01/a',
    title: '記事A',
    description: '説明',
    image: 'https://kosui.me/og/posts-2026-01-01-a.png',
    publishedTime: '2026-01-01T00:30:00+09:00',
  };

  it('公開日時を UTC の ISO 8601 にし、更新日時がなければ公開日時を使う', () => {
    const jsonLd = StructuredData.blogPosting(article);

    expect(jsonLd).toMatchObject({
      '@type': 'BlogPosting',
      headline: '記事A',
      description: '説明',
      datePublished: '2025-12-31T15:30:00.000Z',
      dateModified: '2025-12-31T15:30:00.000Z',
      mainEntityOfPage: { '@id': 'https://kosui.me/posts/2026/01/01/a' },
      author: { '@type': 'Person', name: '岩佐 幸翠' },
    });
  });

  it('更新日時があれば dateModified に使う', () => {
    const jsonLd = StructuredData.blogPosting({ ...article, modifiedTime: '2026-02-01T00:00:00+09:00' });

    expect(jsonLd).toMatchObject({
      datePublished: '2025-12-31T15:30:00.000Z',
      dateModified: '2026-01-31T15:00:00.000Z',
    });
  });

  it('更新日時が日時として読めなければ公開日時を使う', () => {
    const jsonLd = StructuredData.blogPosting({ ...article, modifiedTime: '未定' });

    expect(jsonLd).toMatchObject({ dateModified: '2025-12-31T15:30:00.000Z' });
  });

  it('日時として読めない文字列と、説明のない記事では、その項目を出さない', () => {
    const jsonLd = StructuredData.blogPosting({
      url: article.url,
      title: article.title,
      image: article.image,
      publishedTime: '未定',
    });

    expect(jsonLd).not.toHaveProperty('datePublished');
    expect(jsonLd).not.toHaveProperty('dateModified');
    expect(jsonLd).not.toHaveProperty('description');
  });
});

describe('StructuredData.website / person', () => {
  it('サイトの発行者として著者を同じ @id で参照する', () => {
    const person = StructuredData.person();
    const website = StructuredData.website();

    expect(person['@type']).toBe('Person');
    expect(website).toMatchObject({ '@type': 'WebSite', publisher: { '@id': person['@id'] } });
  });
});

describe('StructuredData.serialize', () => {
  it('script タグを閉じる文字列をエスケープし、JSON としては元の値に戻る', () => {
    const serialized = StructuredData.serialize({ headline: '</script><script>alert(1)</script>' });

    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual({ headline: '</script><script>alert(1)</script>' });
  });
});
