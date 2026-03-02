import type { APIRoute } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';
import { Feed } from 'feed';

type PostEntry = CollectionEntry<'posts'>;

export const GET: APIRoute = async () => {
  const siteUrl = 'https://kosui.me';

  const posts = await getCollection('posts');
  const sortedPosts = posts.sort(
    (a: PostEntry, b: PostEntry) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );

  const feed = new Feed({
    title: 'kosui',
    description: 'kosuiの技術ブログ。TypeScript, Node.js, インフラなどの知見を発信しています。',
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

  for (const post of sortedPosts) {
    feed.addItem({
      title: post.data.title,
      id: `${siteUrl}/${post.data.slug}`,
      link: `${siteUrl}/${post.data.slug}`,
      date: new Date(post.data.date),
      ...(post.data.description ? { description: post.data.description } : {}),
      ...(post.data.image ? { image: post.data.image } : {}),
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
