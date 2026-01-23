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
      <a href='/' class='text-2xl font-bold text-charcoal dark:text-white hover:text-terracotta dark:hover:text-terracotta-light transition-colors'>
        blog.kosui.me
      </a>
      <a
        href='/about'
        class='text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
      >
        ioriについて
      </a>
    </div>
    <section class='mb-8'>
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover blob-bg'>
        <div class='flex items-center gap-4 mb-4 relative z-10'>
          <div class='w-16 h-16 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-clay-sm'>
            {actor.logoUri
              ? (
                <img
                  src={actor.logoUri}
                  alt='User Logo'
                  class='w-16 h-16 blob-avatar object-cover'
                />
              )
              : (
                String(user.username).charAt(0).toUpperCase()
              )}
          </div>
          <div>
            <h1 class='text-2xl font-bold text-charcoal dark:text-white'>
              {String(user.username)}
            </h1>
            <p class='text-charcoal-light dark:text-gray-400'>{handle}</p>
          </div>
        </div>

        <div class='flex flex-wrap items-center gap-4'>
          <div class='flex gap-6 text-sm'>
            <div>
              <span class='font-semibold text-charcoal dark:text-white'>
                {followers.length}
              </span>
              <a class='text-charcoal-light dark:text-gray-400 ml-1 hover:text-terracotta dark:hover:text-terracotta-light transition-colors' href='#followers'>
                Followers
              </a>
            </div>
            <div>
              <span class='font-semibold text-charcoal dark:text-white'>
                {following.length}
              </span>
              <a class='text-charcoal-light dark:text-gray-400 ml-1 hover:text-terracotta dark:hover:text-terracotta-light transition-colors' href='#following'>
                Following
              </a>
            </div>
            <div>
              <span class='font-semibold text-charcoal dark:text-white'>
                {posts.length}
              </span>
              <span class='text-charcoal-light dark:text-gray-400 ml-1'>Posts</span>
            </div>
          </div>
          <a
            href='#remote-follow'
            class='ml-auto px-4 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
          >
            Remote Follow
          </a>
        </div>
      </div>

      <div>
        <div class='hidden target:block' id='followers'>
          <a
            href='#'
            class='w-full h-full bg-charcoal/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
            aria-label='Close modal'
          />
          <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
            <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md pointer-events-auto'>
              <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-3'>
                Followers
              </h2>
              {followers.length > 0
                ? (
                  <div class='space-y-1 max-h-48 overflow-y-auto'>
                    {followers.map((follower) => <ActorLink key={follower.id} actor={follower} />)}
                  </div>
                )
                : (
                  <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                    No followers yet
                  </p>
                )}
              <div class='flex mt-3 justify-end'>
                <a href='#'>
                  <button class='px-4 py-1.5 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'>
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
            class='w-full h-full bg-charcoal/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
            aria-label='Close modal'
          />
          <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
            <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md pointer-events-auto'>
              <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-3'>
                Following
              </h2>
              {following.length > 0
                ? (
                  <div class='space-y-1 max-h-48 overflow-y-auto'>
                    {following.map((followed) => <ActorLink key={followed.id} actor={followed} />)}
                  </div>
                )
                : (
                  <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                    Not following anyone yet
                  </p>
                )}
              <div class='flex mt-3 justify-end'>
                <a href='#'>
                  <button class='px-4 py-1.5 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'>
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
            class='w-full h-full bg-charcoal/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
            aria-label='Close modal'
          />
          <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
            <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md pointer-events-auto'>
              <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-4'>
                Remote Follow
              </h2>

              <form method='post' action={`/users/${user.username}/remote-follow`} class='space-y-3'>
                <input
                  type='text'
                  name='handle'
                  placeholder='@you@your-server.example'
                  required
                  class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset transition-all'
                />
                <button
                  type='submit'
                  class='w-full px-4 py-2 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
                >
                  Proceed to your server
                </button>
              </form>

              <div class='flex items-center gap-3 my-4'>
                <div class='flex-1 h-px bg-warm-gray-dark dark:bg-gray-600' />
                <span class='text-xs text-charcoal-light dark:text-gray-500 uppercase'>or</span>
                <div class='flex-1 h-px bg-warm-gray-dark dark:bg-gray-600' />
              </div>

              <div>
                <p class='text-xs text-charcoal-light dark:text-gray-400 mb-2'>
                  Copy handle to search manually on your server:
                </p>
                <div class='flex items-center gap-2 p-3 bg-sand-light/50 dark:bg-gray-700/50 rounded-xl shadow-clay-inset'>
                  <code class='flex-1 text-sm text-charcoal dark:text-gray-300 break-all'>{handle}</code>
                  <button
                    type='button'
                    onclick={`navigator.clipboard.writeText('${handle}'); this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 1500)`}
                    class='px-3 py-1.5 bg-warm-gray dark:bg-gray-600 text-charcoal dark:text-gray-300 text-xs rounded-lg hover:bg-warm-gray-dark dark:hover:bg-gray-500 transition-colors flex-shrink-0 shadow-clay-sm'
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div class='flex mt-4 justify-end'>
                <a href='#'>
                  <button class='px-4 py-1.5 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'>
                    Close
                  </button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class='space-y-6 py-2'>
      <h2 class='text-lg font-semibold text-charcoal dark:text-white'>Posts</h2>
      {posts.length > 0
        ? (
          posts.map((post) => <PostView post={post} />)
        )
        : (
          <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 text-center'>
            <p class='text-charcoal-light dark:text-gray-400'>No posts yet</p>
          </div>
        )}
    </section>
  </Layout>
);
