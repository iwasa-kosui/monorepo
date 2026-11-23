const SITE_URL = 'https://kosui.me';
const PERSON_ID = `${SITE_URL}/about#person`;
const WEBSITE_ID = `${SITE_URL}/#website`;

export type JsonLd = Readonly<Record<string, unknown>>;

const author: JsonLd = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: '岩佐 幸翠',
  alternateName: 'kosui',
  url: `${SITE_URL}/about`,
  image: 'https://icon.kosui.me',
  jobTitle: 'テックリード',
  worksFor: { '@type': 'Organization', name: '株式会社カケハシ' },
  sameAs: [
    'https://github.com/iwasa-kosui',
    'https://x.com/kosui_me',
    'https://www.hatena.ne.jp/kosui_me/',
  ],
};

const personJsonLd = (): JsonLd => ({
  '@context': 'https://schema.org',
  ...author,
});

const websiteJsonLd = (): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: `${SITE_URL}/`,
  name: 'kosui',
  alternateName: 'kosui.me',
  inLanguage: 'ja',
  publisher: { '@id': PERSON_ID },
});

type Article = Readonly<{
  url: string;
  title: string;
  description?: string;
  image: string;
  publishedTime: string;
  modifiedTime?: string;
}>;

const toIsoString = (value: string): string | undefined => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

const blogPostingJsonLd = (article: Article): JsonLd => {
  const datePublished = toIsoString(article.publishedTime);
  const dateModified = (article.modifiedTime ? toIsoString(article.modifiedTime) : undefined) ?? datePublished;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: { '@type': 'WebPage', '@id': article.url },
    url: article.url,
    headline: article.title,
    ...(article.description ? { description: article.description } : {}),
    image: [article.image],
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    inLanguage: 'ja',
    author,
    publisher: { '@id': PERSON_ID },
    isPartOf: { '@id': WEBSITE_ID },
  };
};

/**
 * `<script type="application/ld+json">` に埋め込む文字列にする。
 * 記事タイトルに `</script>` が含まれていてもタグが閉じないよう、`<` をエスケープする。
 */
const serialize = (jsonLd: JsonLd): string => JSON.stringify(jsonLd).replace(/</g, '\\u003c');

export const StructuredData = {
  person: personJsonLd,
  website: websiteJsonLd,
  blogPosting: blogPostingJsonLd,
  toIsoString,
  serialize,
} as const;
