import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import { PostView } from '../components/PostView.tsx';

type PostWithAuthor = {
  postId: string;
  content: string;
  [key: string]: unknown;
};

type LikedPostsResponse = {
  user: { id: string; username: string };
  posts: PostWithAuthor[];
};

const LikedPostsPage = () => {
  const [data, setData] = useState<LikedPostsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLikedPosts = async () => {
      try {
        const response = await fetch('/api/v1/liked-posts');
        if (response.status === 401) {
          window.location.href = '/sign-in';
          return;
        }
        if (!response.ok) {
          setError('Failed to load liked posts');
          return;
        }
        const result = await response.json();
        setData(result);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchLikedPosts();
  }, []);

  if (isLoading) {
    return (
      <section class='mb-8'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Liked Posts</h1>
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
      </section>
    );
  }

  if (error) {
    return (
      <section class='mb-8'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Liked Posts</h1>
        <p class='text-charcoal-light dark:text-gray-400'>{error}</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Liked Posts</h1>

      <div class='space-y-6 py-2'>
        {data.posts.length > 0
          ? (
            data.posts.map((post) => (
              <PostView
                key={post.postId}
                post={post as never}
                currentUserId={data.user.id as never}
              />
            ))
          )
          : (
            <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
              <div class='w-16 h-16 mx-auto mb-4 rounded-clay bg-sand-light dark:bg-gray-700 flex items-center justify-center shadow-clay-sm'>
                <svg
                  class='w-8 h-8 text-charcoal-light dark:text-gray-500'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z'
                  />
                </svg>
              </div>
              <p class='text-charcoal-light dark:text-gray-400'>
                No liked posts yet
              </p>
              <p class='text-sm text-warm-gray-dark dark:text-gray-500 mt-1'>
                Posts you like will appear here.
              </p>
            </div>
          )}
      </div>
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<LikedPostsPage />, root);
}
