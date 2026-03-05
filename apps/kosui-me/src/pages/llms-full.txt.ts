import type { APIRoute } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';

import externalArticlesData from '../content/external-articles/data.json';
import talksData from '../content/talks/data.json';

type PostEntry = CollectionEntry<'posts'>;

type TalkMeta = {
  title: string;
  date: string;
  event: string;
  tags: string[];
  duration: string;
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
  tags: string[];
};

export const GET: APIRoute = async () => {
  const siteUrl = 'https://kosui.me';

  const allPosts = await getCollection('posts');
  const posts = allPosts.filter((post: PostEntry) => !post.data.private);
  const sortedPosts = posts.sort(
    (a: PostEntry, b: PostEntry) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );

  const talks = (talksData as TalkMeta[]).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const externalArticles = (externalArticlesData as ExternalArticleMeta[]).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const lines: string[] = [
    '# kosui',
    '',
    '> kosuiの活動記録。技術ブログ、登壇資料、外部メディア寄稿などを発信しています。',
    '',
  ];

  lines.push('# Posts', '');
  for (const post of sortedPosts) {
    lines.push(`## ${post.data.title}`, '');
    if (post.data.description) {
      lines.push(post.data.description, '');
    }
    lines.push(post.body ?? '', '');
  }

  lines.push('# Talks', '');
  for (const talk of talks) {
    lines.push(`## ${talk.title}`, '');
    lines.push(`- Event: ${talk.event}`, '');
    lines.push(`- Date: ${talk.date}`, '');
    lines.push(`- Duration: ${talk.duration}`, '');
    if (talk.tags.length > 0) {
      lines.push(`- Tags: ${talk.tags.join(', ')}`, '');
    }
    lines.push(`- URL: ${siteUrl}/talks/${talk.year}/${talk.name}`, '');
    lines.push(talk.description, '');
  }

  lines.push('# External Articles', '');
  for (const article of externalArticles) {
    lines.push(`## ${article.title}`, '');
    lines.push(`- Publisher: ${article.publisher}`, '');
    lines.push(`- Date: ${article.date}`, '');
    lines.push(`- URL: ${article.url}`, '');
    if (article.tags.length > 0) {
      lines.push(`- Tags: ${article.tags.join(', ')}`, '');
    }
    if (article.description) {
      lines.push(article.description, '');
    }
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
