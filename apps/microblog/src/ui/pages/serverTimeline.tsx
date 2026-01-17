import type { FC } from 'hono/jsx';

import type { PostWithAuthor } from '../../domain/post/post.ts';
import { Layout } from '../../layout.tsx';
import { PostView } from '../components/PostView.tsx';

type Props = Readonly<{
  posts: ReadonlyArray<PostWithAuthor>;
}>;

export const ServerTimelinePage: FC<Props> = ({ posts }) => (
  <Layout>
    <section class='space-y-4'>
      <div class='flex items-center justify-between mb-2'>
        <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
          blog.kosui.me
        </h1>
        <a
          href='/about'
          class='text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors'
        >
          ioriについて
        </a>
      </div>
      {posts.length > 0
        ? (
          posts.map((post) => <PostView key={post.postId} post={post} />)
        )
        : (
          <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-puffy dark:shadow-puffy-dark p-6 text-center'>
            <p class='text-gray-500 dark:text-gray-400'>まだ投稿がありません</p>
          </div>
        )}
    </section>
  </Layout>
);
