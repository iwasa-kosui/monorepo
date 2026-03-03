import type { APIRoute } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';
import { Feed } from 'feed';

import externalArticlesData from '../content/external-articles/data.json';
import talksData from '../content/talks/data.json';

type PostEntry = CollectionEntry<'posts'>;

type TalkMeta = {
  title: string;
  date: string;
  event: string;
  description: string;
  year: string;
  name: string;
};

type ExternalArticleMeta = {
  title: string;
  url: string;
  date: string;
  publisher: string;
  description?: string;
};

type FeedItem = {
  title: string;
  id: string;
  link: string;
  date: Date;
  description?: string;
  image?: string;
};

export const GET: APIRoute = async () => {
  const siteUrl = 'https://kosui.me';

  const posts = await getCollection('posts');
  const talks = talksData as TalkMeta[];
  const externalArticles = externalArticlesData as ExternalArticleMeta[];

  const postItems: FeedItem[] = posts.map((post: PostEntry) => ({
    title: post.data.title,
    id: `${siteUrl}/${post.data.slug}`,
    link: `${siteUrl}/${post.data.slug}`,
    date: new Date(post.data.date),
    ...(post.data.description ? { description: post.data.description } : {}),
    ...(post.data.image ? { image: post.data.image } : {}),
  }));

  const talkItems: FeedItem[] = talks.map((talk: TalkMeta) => ({
    title: `[Talk] ${talk.title}`,
    id: `${siteUrl}/talks/${talk.year}/${talk.name}`,
    link: `${siteUrl}/talks/${talk.year}/${talk.name}`,
    date: new Date(talk.date),
    description: `${talk.event} (${talk.description})`,
  }));

  const externalItems: FeedItem[] = externalArticles.map(
    (article: ExternalArticleMeta) => ({
      title: `[External] ${article.title}`,
      id: article.url,
      link: article.url,
      date: new Date(article.date),
      ...(article.description
        ? { description: `${article.publisher}: ${article.description}` }
        : { description: article.publisher }),
    }),
  );

  const allItems = [...postItems, ...talkItems, ...externalItems].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );

  const feed = new Feed({
    title: 'kosui',
    description: 'kosuiの活動記録。技術ブログ、登壇資料、外部メディア寄稿などを発信しています。',
    id: siteUrl,
    link: siteUrl,
    language: 'ja',
    favicon: `${siteUrl}/favicon.ico`,
    copyright: `Copyright ${new Date().getFullYear()} kosui`,
    author: {
      name: 'kosui',
      link: 'https://x.com/kosui_me',
    },
  });

  for (const item of allItems) {
    feed.addItem(item);
  }

  return new Response(feed.rss2(), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
