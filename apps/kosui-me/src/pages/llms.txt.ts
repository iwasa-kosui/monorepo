import type { APIRoute } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';

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

export const GET: APIRoute = async () => {
  const siteUrl = 'https://kosui.me';

  const posts = await getCollection('posts');
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
    `- [llms-full.txt](${siteUrl}/llms-full.txt): 全投稿の本文を含むフルバージョン`,
    '',
    '## Posts',
    '',
    ...sortedPosts.map((post: PostEntry) => {
      const desc = post.data.description ? `: ${post.data.description}` : '';
      return `- [${post.data.title}](${siteUrl}/${post.data.slug})${desc}`;
    }),
    '',
    '## Talks',
    '',
    ...talks.map((talk: TalkMeta) => {
      return `- [${talk.title}](${siteUrl}/talks/${talk.year}/${talk.name}): ${talk.event} - ${talk.description}`;
    }),
    '',
    '## External Articles',
    '',
    ...externalArticles.map((article: ExternalArticleMeta) => {
      const desc = article.description ? `: ${article.description}` : '';
      return `- [${article.title}](${article.url}) (${article.publisher})${desc}`;
    }),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
