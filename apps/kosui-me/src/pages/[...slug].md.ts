import type { APIRoute, GetStaticPaths } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type PostEntry = CollectionEntry<'posts'>;

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('posts');
  return posts.map((post: PostEntry) => ({
    params: { slug: post.data.slug },
    props: { post },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: PostEntry };
  if (!post.filePath) {
    return new Response('Not Found', { status: 404 });
  }
  const absolutePath = resolve(process.cwd(), post.filePath);
  const content = await readFile(absolutePath, 'utf-8');
  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};
