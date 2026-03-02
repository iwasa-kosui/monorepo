import type { APIRoute } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';

type PostEntry = CollectionEntry<'posts'>;

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts');
  const sortedPosts = posts.sort(
    (a: PostEntry, b: PostEntry) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );

  const lines: string[] = [
    '# kosui',
    '',
    '> kosuiの技術ブログ。TypeScript, Node.js, インフラなどサーバサイド開発に関する知見を発信しています。',
    '',
  ];

  for (const post of sortedPosts) {
    lines.push(`## ${post.data.title}`, '');
    if (post.data.description) {
      lines.push(post.data.description, '');
    }
    lines.push(post.body ?? '', '');
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
