import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { IoriXPostBody } from '../../adaptor/routes/workerIoriXPostsRouter.ts';
import { fetchXPosts, isUnauthorizedError } from '../api/mastodonClient.ts';
import { XPostList } from '../components/XPostList.tsx';

const XPostsPage = () => {
  const [posts, setPosts] = useState<readonly IoriXPostBody[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setPosts((await fetchXPosts()).posts);
      } catch (fetchError) {
        if (isUnauthorizedError(fetchError)) {
          window.location.href = '/sign-in';
          return;
        }
        setError(fetchError instanceof TypeError ? 'Network error. Please try again.' : 'Failed to load X posts');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>X</h1>
      {isLoading
        ? (
          <div class='flex items-center justify-center py-8'>
            <svg class='animate-spin h-8 w-8 text-terracotta' viewBox='0 0 24 24'>
              <circle class='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' stroke-width='4' fill='none' />
              <path
                class='opacity-75'
                fill='currentColor'
                d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
              />
            </svg>
          </div>
        )
        : error
        ? <p class='text-charcoal-light dark:text-gray-400'>{error}</p>
        : posts.length === 0
        ? <p class='text-charcoal-light dark:text-gray-400'>取り込んだ投稿はありません</p>
        : <XPostList posts={posts} />}
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<XPostsPage />, root);
}
