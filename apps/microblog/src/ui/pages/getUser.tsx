import { Actor } from '../../domain/actor/actor.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { User } from '../../domain/user/user.ts';
import { Layout } from '../../layout.tsx';
import { ActorLink } from '../components/ActorLink.tsx';
import { PostView } from '../components/PostView.tsx';

type Props = Readonly<{
  user: User;
  actor: Actor;
  handle: string;
  followers: ReadonlyArray<Actor>;
  following: ReadonlyArray<Actor>;
  posts: ReadonlyArray<PostWithAuthor>;
}>;

export const GetUserPage = ({
  user,
  actor,
  handle,
  followers,
  following,
  posts,
}: Props) => (
  <Layout>
    <section class='mb-8'>
      <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'>
        <div class='flex items-center gap-4 mb-4'>
          <div class='w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-2xl font-bold flex-shrink-0'>
            {actor.logoUri
              ? (
                <img
                  src={actor.logoUri}
                  alt='User Logo'
                  class='w-16 h-16 rounded-full object-cover'
                />
              )
              : (
                String(user.username).charAt(0).toUpperCase()
              )}
          </div>
          <div>
            <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
              {String(user.username)}
            </h1>
            <p class='text-gray-500 dark:text-gray-400'>{handle}</p>
          </div>
        </div>

        <div class='flex flex-wrap items-center gap-4 border-t border-gray-200 dark:border-gray-700 pt-4'>
          <div class='flex gap-6 text-sm'>
            <div>
              <span class='font-semibold text-gray-900 dark:text-white'>
                {followers.length}
              </span>
              <a class='text-gray-500 dark:text-gray-400 ml-1' href='#followers'>
                Followers
              </a>
            </div>
            <div>
              <span class='font-semibold text-gray-900 dark:text-white'>
                {following.length}
              </span>
              <a class='text-gray-500 dark:text-gray-400 ml-1' href='#following'>
                Following
              </a>
            </div>
            <div>
              <span class='font-semibold text-gray-900 dark:text-white'>
                {posts.length}
              </span>
              <span class='text-gray-500 dark:text-gray-400 ml-1'>Posts</span>
            </div>
          </div>
          <a
            href='#remote-follow'
            class='ml-auto px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors'
          >
            Remote Follow
          </a>
        </div>
      </div>

      <div>
        <div class='hidden target:block' id='followers'>
          <div class='w-full h-full bg-black/80 fixed top-0 left-0'>
            <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 m-8 max-w-md mx-auto'>
              <h2 class='text-lg font-semibold text-gray-900 dark:text-white mb-3'>
                Followers
              </h2>
              {followers.length > 0
                ? (
                  <div class='space-y-1 max-h-48 overflow-y-auto'>
                    {followers.map((follower) => <ActorLink key={follower.id} actor={follower} />)}
                  </div>
                )
                : (
                  <p class='text-gray-500 dark:text-gray-400 text-sm'>
                    No followers yet
                  </p>
                )}
              <a href='#' class='text-blue-500 hover:underline'>
                <button class='mt-4 px-4 py-2 text-white rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors'>
                  Close
                </button>
              </a>
            </div>
          </div>
        </div>

        <div class='hidden target:block' id='following'>
          <div class='w-full h-full bg-black/80 fixed top-0 left-0'>
            <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 m-8 max-w-md mx-auto'>
              <h2 class='text-lg font-semibold text-gray-900 dark:text-white mb-3'>
                Following
              </h2>
              {following.length > 0
                ? (
                  <div class='space-y-1 max-h-48 overflow-y-auto'>
                    {following.map((followed) => <ActorLink key={followed.id} actor={followed} />)}
                  </div>
                )
                : (
                  <p class='text-gray-500 dark:text-gray-400 text-sm'>
                    Not following anyone yet
                  </p>
                )}
              <a href='#' class='text-blue-500 hover:underline'>
                <button class='mt-4 px-4 py-2 text-white rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors'>
                  Close
                </button>
              </a>
            </div>
          </div>
        </div>

        <div class='hidden target:block' id='remote-follow'>
          <div class='w-full h-full bg-black/80 fixed top-0 left-0'>
            <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 m-8 max-w-md mx-auto'>
              <div class='flex items-center justify-between mb-4'>
                <h2 class='text-lg font-semibold text-gray-900 dark:text-white'>
                  Remote Follow
                </h2>
                <a
                  href='#'
                  class='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors'
                  aria-label='Close'
                >
                  <svg class='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
                  </svg>
                </a>
              </div>

              <form method='post' action={`/users/${user.username}/remote-follow`} class='space-y-3'>
                <input
                  type='text'
                  name='handle'
                  placeholder='@you@your-server.example'
                  required
                  class='w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                />
                <button
                  type='submit'
                  class='w-full px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors'
                >
                  Proceed to your server
                </button>
              </form>

              <div class='flex items-center gap-3 my-4'>
                <div class='flex-1 h-px bg-gray-200 dark:bg-gray-600' />
                <span class='text-xs text-gray-400 dark:text-gray-500 uppercase'>or</span>
                <div class='flex-1 h-px bg-gray-200 dark:bg-gray-600' />
              </div>

              <div>
                <p class='text-xs text-gray-500 dark:text-gray-400 mb-2'>
                  Copy handle to search manually on your server:
                </p>
                <div class='flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg'>
                  <code class='flex-1 text-sm text-gray-700 dark:text-gray-300 break-all'>{handle}</code>
                  <button
                    type='button'
                    onclick={`navigator.clipboard.writeText('${handle}'); this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 1500)`}
                    class='px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex-shrink-0'
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class='space-y-4'>
      <h2 class='text-lg font-semibold text-gray-900 dark:text-white'>Posts</h2>
      {posts.length > 0
        ? (
          posts.map((post) => <PostView post={post} />)
        )
        : (
          <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center'>
            <p class='text-gray-500 dark:text-gray-400'>No posts yet</p>
          </div>
        )}
    </section>
  </Layout>
);
