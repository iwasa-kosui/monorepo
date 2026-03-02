import type { APIRoute } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';

type PostEntry = CollectionEntry<'posts'>;

export const GET: APIRoute = async () => {
  const siteUrl = 'https://kosui.me';

  const posts = await getCollection('posts');
  const sortedPosts = posts.sort(
    (a: PostEntry, b: PostEntry) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );

  const lines: string[] = [
    '# kosui',
    '',
    '> kosuiの技術ブログ。TypeScript, Node.js, インフラなどサーバサイド開発に関する知見を発信しています。',
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
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
