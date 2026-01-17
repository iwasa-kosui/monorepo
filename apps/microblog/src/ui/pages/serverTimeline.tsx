import type { FC } from 'hono/jsx';

import type { PostWithAuthor } from '../../domain/post/post.ts';
import { Layout } from '../../layout.tsx';
import { PostView } from '../components/PostView.tsx';

type Props = Readonly<{
  posts: ReadonlyArray<PostWithAuthor>;
}>;

export const ServerTimelinePage: FC<Props> = ({ posts }) => (
  <Layout>
    <section class='mb-6'>
      <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'>
        <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
          Server Timeline
        </h1>
        <p class='text-gray-500 dark:text-gray-400 mb-4'>
          このサーバーの最新の投稿です
        </p>
        <div class='flex gap-3'>
          <a
            href='/sign-in'
            class='inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors'
          >
            <svg
              class='w-5 h-5 mr-2'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                stroke-linecap='round'
                stroke-linejoin='round'
                stroke-width='2'
                d='M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1'
              />
            </svg>
            ログイン
          </a>
          <a
            href='/sign-up'
            class='inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors'
          >
            <svg
              class='w-5 h-5 mr-2'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                stroke-linecap='round'
                stroke-linejoin='round'
                stroke-width='2'
                d='M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z'
              />
            </svg>
            新規登録
          </a>
        </div>
      </div>
    </section>

    <section class='space-y-4'>
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
