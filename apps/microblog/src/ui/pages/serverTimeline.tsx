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
      <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
        blog.kosui.me
      </h1>
      <h2 class='text-lg font-semibold text-gray-900 dark:text-white'>
        最新の投稿
      </h2>
      {posts.length > 0
        ? (
          posts.map((post) => <PostView key={post.postId} post={post} />)
        )
        : (
          <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center'>
            <p class='text-gray-500 dark:text-gray-400'>まだ投稿がありません</p>
          </div>
        )}
    </section>
  </Layout>
);
