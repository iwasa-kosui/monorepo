import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { User } from '../../domain/user/user.ts';
import { Layout } from '../../layout.tsx';
import { PostView } from '../components/PostView.tsx';

type Props = Readonly<{
  user: User;
  posts: ReadonlyArray<PostWithAuthor>;
}>;

export const LikedPostsPage = ({ user, posts }: Props) => (
  <Layout isLoggedIn={true}>
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>
        Liked Posts
      </h1>

      <div class='space-y-6 py-2'>
        {posts.length > 0
          ? (
            posts.map((post) => (
              <PostView
                key={post.postId}
                post={post}
                currentUserId={user.id}
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
  </Layout>
);
