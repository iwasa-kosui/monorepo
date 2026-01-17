import { hc } from 'hono/client';
import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { Actor } from '../../domain/actor/actor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { User } from '../../domain/user/user.ts';
import { ActorLink } from '../components/ActorLink.tsx';
import { Modal } from '../components/Modal.tsx';
import { PostForm } from '../components/PostForm.tsx';
import { PostView } from '../components/PostView.tsx';

const client = hc<APIRouterType>('/api');

type Props = Readonly<{
  user: User;
  posts: ReadonlyArray<PostWithAuthor>;
  actor: Actor;
  followers: ReadonlyArray<Actor>;
  following: ReadonlyArray<Actor>;
  fetchData: (createdAt: Instant | undefined) => Promise<void>;
  onLike: (objectUri: string) => Promise<void>;
  likingPostUri: string | null;
  onDelete: (postId: string) => Promise<void>;
  deletingPostId: string | null;
}>;

export const HomePage = ({
  user,
  posts,
  actor,
  followers,
  following,
  fetchData,
  onLike,
  likingPostUri,
  onDelete,
  deletingPostId,
}: Props) => {
  const url = new URL(actor.uri);
  const handle = `@${user.username}@${url.host}`;
  const debounce = <T extends unknown[]>(
    func: (...args: T) => void,
    wait: number,
  ) => {
    let timeoutId: NodeJS.Timeout | undefined;
    return (...args: T) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func(...args);
      }, wait);
    };
  };
  const debouncedFetchData = debounce(fetchData, 300);
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.body.scrollHeight;
      const scrollTop = document.body.scrollTop;
      const clientHeight = document.body.clientHeight;
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        const oldest = posts.reduce((prev, curr) => new Date(prev.createdAt) < new Date(curr.createdAt) ? prev : curr);
        debouncedFetchData(oldest.createdAt);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [posts]);
  return (
    <>
      <section class='mb-8'>
        <header class='mb-4'>
          <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
            Hi, {String(user.username)}
          </h1>
        </header>
        <section class='mb-8'>
          <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6'>
            <div class='flex items-center gap-4 mb-4'>
              <a href='#update-bio' class='relative group flex-shrink-0'>
                <div class='w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-2xl font-bold'>
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
                <div class='absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity'>
                  <svg class='w-5 h-5 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path
                      stroke-linecap='round'
                      stroke-linejoin='round'
                      stroke-width='2'
                      d='M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'
                    />
                  </svg>
                </div>
              </a>
              <div>
                <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
                  {String(user.username)}
                </h1>
                <p class='text-gray-500 dark:text-gray-400'>{handle}</p>
              </div>
            </div>

            <div class='flex gap-6 text-sm'>
              <div>
                <span class='font-semibold text-gray-900 dark:text-white'>
                  {followers.length}
                </span>
                <a
                  class='text-gray-500 dark:text-gray-400 ml-1'
                  href='#followers'
                >
                  Followers
                </a>
              </div>
              <div>
                <span class='font-semibold text-gray-900 dark:text-white'>
                  {following.length}
                </span>
                <a
                  class='text-gray-500 dark:text-gray-400 ml-1'
                  href='#following'
                >
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
          </div>

          <div>
            <Modal id='followers'>
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
            </Modal>

            <Modal id='following'>
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
            </Modal>
          </div>
        </section>

        <PostForm id='post' />
      </section>
      <Modal id='post-modal' showCloseButton={false}>
        <PostForm formId='post-modal-form' />
      </Modal>
      <Modal id='update-bio' showCloseButton={false}>
        <form method='post' action={`/users/${user.username}`}>
          <p class='text-gray-600 dark:text-gray-400 text-sm mb-3'>
            Enter a URL for your profile image
          </p>
          <input
            type='url'
            name='logoUri'
            placeholder='https://example.com/image.png'
            class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3'
          />
          <div class='flex gap-2 justify-end'>
            <a href='#'>
              <button
                type='button'
                class='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'
              >
                Cancel
              </button>
            </a>
            <button
              type='submit'
              class='px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-2xl transition-colors'
            >
              Update
            </button>
          </div>
        </form>
      </Modal>
      <section class='space-y-4'>
        {posts.map((post) => (
          <PostView
            post={post}
            onLike={onLike}
            isLiking={post.type === 'remote'
              && 'uri' in post
              && likingPostUri === post.uri}
            onDelete={onDelete}
            isDeleting={deletingPostId === post.postId}
            currentUserId={user.id}
          />
        ))}
      </section>
      <script src='https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js'></script>
    </>
  );
};

const App = () => {
  const [init, setInit] = useState(false);
  const [likingPostUri, setLikingPostUri] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [data, setData] = useState<
    | { error: string }
    | {
      user: User;
      actor: Actor;
      posts: readonly PostWithAuthor[];
      followers: readonly Actor[];
      following: readonly Actor[];
    }
    | null
  >(null);

  const fetchData = async (createdAt: Instant | undefined) => {
    const res = await client.v1.home.$get({
      query: { createdAt: createdAt ? String(createdAt) : undefined },
    });
    const latest = await res.json();
    if (latest && !('error' in latest) && data && !('error' in data)) {
      setData({
        ...latest,
        posts: [...data.posts, ...latest.posts],
      });
    } else {
      setData(latest);
    }
  };

  const handleLike = async (objectUri: string) => {
    setLikingPostUri(objectUri);
    try {
      const res = await client.v1.like.$post({
        json: { objectUri },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Update the post's liked status in the local state
        if (data && !('error' in data)) {
          setData({
            ...data,
            posts: data.posts.map((post) =>
              post.type === 'remote' && 'uri' in post && post.uri === objectUri
                ? { ...post, liked: true }
                : post
            ),
          });
        }
      } else if ('error' in result) {
        console.error('Failed to like:', result.error);
      }
    } catch (error) {
      console.error('Failed to like:', error);
    } finally {
      setLikingPostUri(null);
    }
  };

  const handleDelete = async (postId: string) => {
    setDeletingPostId(postId);
    try {
      const res = await client.v1.posts[':postId'].$delete({
        param: { postId },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Remove the post from the local state
        if (data && !('error' in data)) {
          setData({
            ...data,
            posts: data.posts.filter((post) => post.postId !== postId),
          });
        }
      } else if ('error' in result) {
        console.error('Failed to delete:', result.error);
        alert(`Failed to delete: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete the post. Please try again.');
    } finally {
      setDeletingPostId(null);
    }
  };

  useEffect(() => {
    if (!init) {
      setInit(true);
      fetchData(undefined);
    }
  }, [init]);
  if (data === null) {
    return <div>Loading...</div>;
  }
  if ('error' in data) {
    return <div>Error: {data.error}</div>;
  }
  return (
    <HomePage
      user={data.user}
      actor={data.actor}
      posts={data.posts}
      followers={data.followers}
      following={data.following}
      fetchData={fetchData}
      onLike={handleLike}
      likingPostUri={likingPostUri}
      onDelete={handleDelete}
      deletingPostId={deletingPostId}
    />
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
