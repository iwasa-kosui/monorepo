import type { FC } from 'hono/jsx';

import type { PostWithAuthor } from '../../domain/post/post.ts';
import { Layout } from '../../layout.tsx';
import { PostView } from '../components/PostView.tsx';

type Props = Readonly<{
  posts: ReadonlyArray<PostWithAuthor>;
}>;

export const ServerTimelinePage: FC<Props> = ({ posts }) => (
  <Layout>
    <section class='space-y-6 py-2'>
      <div class='flex items-center justify-between mb-2'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white'>
          blog.kosui.me
        </h1>
        <a
          href='/about'
          class='text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
        >
          ioriについて
        </a>
      </div>
      {posts.length > 0
        ? (
          posts.map((post) => <PostView key={post.postId} post={post} />)
        )
        : (
          <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 text-center'>
            <p class='text-charcoal-light dark:text-gray-400'>まだ投稿がありません</p>
          </div>
        )}
    </section>
  </Layout>
);
