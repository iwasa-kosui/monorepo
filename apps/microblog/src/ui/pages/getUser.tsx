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
  isLoggedIn?: boolean;
}>;

export const GetUserPage = ({
  user,
  actor,
  handle,
  followers,
  following,
  posts,
  isLoggedIn = false,
}: Props) => (
  <Layout isLoggedIn={isLoggedIn}>
    <div class='flex items-center justify-between mb-6'>
      <a href='/' class='text-2xl font-bold text-gray-900 dark:text-white hover:opacity-80 transition-opacity'>
        blog.kosui.me
      </a>
      <a
        href='/about'
        class='text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors'
      >
        ioriについて
      </a>
    </div>
    <section class='mb-8'>
      <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6'>
        <div class='flex items-center gap-4 mb-4'>
          <div class='w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-2xl font-bold flex-shrink-0'>
            {actor.logoUri
              ? (
                <img
                  src={actor.logoUri}
                  alt='User Logo'
                  class='w-16 h-16 rounded-2xl object-cover'
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

        <div class='flex flex-wrap items-center gap-4'>
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
            class='ml-auto px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-2xl transition-colors'
          >
            Remote Follow
          </a>
        </div>
      </div>

      <div>
        <div class='hidden target:block' id='followers'>
          <a
            href='#'
            class='w-full h-full bg-black/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
            aria-label='Close modal'
          />
          <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
            <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 w-full max-w-md pointer-events-auto'>
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
              <div class='flex mt-3 justify-end'>
                <a href='#'>
                  <button class='px-4 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'>
                    Close
                  </button>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div class='hidden target:block' id='following'>
          <a
            href='#'
            class='w-full h-full bg-black/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
            aria-label='Close modal'
          />
          <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
            <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 w-full max-w-md pointer-events-auto'>
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
              <div class='flex mt-3 justify-end'>
                <a href='#'>
                  <button class='px-4 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'>
                    Close
                  </button>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div class='hidden target:block' id='remote-follow'>
          <a
            href='#'
            class='w-full h-full bg-black/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
            aria-label='Close modal'
          />
          <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
            <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 w-full max-w-md pointer-events-auto'>
              <h2 class='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                Remote Follow
              </h2>

              <form method='post' action={`/users/${user.username}/remote-follow`} class='space-y-3'>
                <input
                  type='text'
                  name='handle'
                  placeholder='@you@your-server.example'
                  required
                  class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400'
                />
                <button
                  type='submit'
                  class='w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-2xl transition-colors'
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
                <div class='flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl'>
                  <code class='flex-1 text-sm text-gray-700 dark:text-gray-300 break-all'>{handle}</code>
                  <button
                    type='button'
                    onclick={`navigator.clipboard.writeText('${handle}'); this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 1500)`}
                    class='px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs rounded-xl hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex-shrink-0'
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div class='flex mt-4 justify-end'>
                <a href='#'>
                  <button class='px-4 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'>
                    Close
                  </button>
                </a>
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
          <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 text-center'>
            <p class='text-gray-500 dark:text-gray-400'>No posts yet</p>
          </div>
        )}
    </section>
  </Layout>
);
