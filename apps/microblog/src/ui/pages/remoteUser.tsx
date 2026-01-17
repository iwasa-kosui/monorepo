import { hc } from 'hono/client';
import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { RemoteActor } from '../../domain/actor/remoteActor.ts';
import { RemoteActor as RemoteActorDomain } from '../../domain/actor/remoteActor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { debounce } from '../../helper/debounce.ts';
import { PostView } from '../components/PostView.tsx';

const client = hc<APIRouterType>('/api');

type Props = Readonly<{
  remoteActor: RemoteActor;
  posts: ReadonlyArray<PostWithAuthor>;
  isFollowing: boolean;
  isLoggedIn: boolean;
  fetchData: (createdAt: Instant | undefined) => Promise<void>;
  onLike: (objectUri: string) => Promise<void>;
  likingPostUri: string | null;
}>;

export const RemoteUserPage = ({
  remoteActor,
  posts,
  isFollowing,
  isLoggedIn,
  fetchData,
  onLike,
  likingPostUri,
}: Props) => {
  const handle = RemoteActorDomain.getHandle(remoteActor) ?? remoteActor.uri;
  const displayName = remoteActor.username ?? handle;

  const debouncedFetchData = debounce(fetchData, 300);

  useEffect(() => {
    if (posts.length === 0) return;

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
        <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6'>
          <div class='flex items-center gap-4 mb-4'>
            <div class='w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-2xl font-bold flex-shrink-0'>
              {remoteActor.logoUri
                ? (
                  <img
                    src={remoteActor.logoUri}
                    alt='User Logo'
                    class='w-16 h-16 rounded-2xl object-cover'
                  />
                )
                : (
                  displayName.charAt(0).toUpperCase()
                )}
            </div>
            <div class='flex-1'>
              <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
                {displayName}
              </h1>
              <p class='text-gray-500 dark:text-gray-400'>@{handle}</p>
            </div>
          </div>

          {remoteActor.url && (
            <div class='mb-4'>
              <a
                href={remoteActor.url}
                target='_blank'
                rel='noopener noreferrer'
                class='text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm'
              >
                View original profile →
              </a>
            </div>
          )}

          <div class='flex gap-2'>
            {isLoggedIn
              ? (
                isFollowing
                  ? (
                    <form
                      method='post'
                      action={`/remote-users/${remoteActor.id}/unfollow`}
                    >
                      <button
                        type='submit'
                        class='px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors'
                      >
                        Unfollow
                      </button>
                    </form>
                  )
                  : (
                    <form
                      method='post'
                      action={`/remote-users/${remoteActor.id}/follow`}
                    >
                      <button
                        type='submit'
                        class='px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-2xl transition-colors'
                      >
                        Follow
                      </button>
                    </form>
                  )
              )
              : (
                <p class='text-gray-500 dark:text-gray-400 text-sm'>
                  <a href='/sign-in' class='text-gray-700 dark:text-gray-300 hover:underline'>
                    Sign in
                  </a>{' '}
                  to follow this user
                </p>
              )}
          </div>
        </div>
      </section>

      <section class='space-y-4'>
        <h2 class='text-xl font-bold text-gray-900 dark:text-white mb-4'>
          Posts
        </h2>
        {posts.length === 0 ? <p class='text-gray-500 dark:text-gray-400'>No posts yet.</p> : (
          posts.map((post) => (
            <PostView
              key={post.postId}
              post={post}
              onLike={onLike}
              isLiking={post.type === 'remote'
                && 'uri' in post
                && likingPostUri === post.uri}
            />
          ))
        )}
      </section>
    </>
  );
};

const App = () => {
  const [init, setInit] = useState(false);
  const [likingPostUri, setLikingPostUri] = useState<string | null>(null);
  const [data, setData] = useState<
    | { error: string }
    | {
      remoteActor: RemoteActor;
      posts: readonly PostWithAuthor[];
      isFollowing: boolean;
      isLoggedIn: boolean;
    }
    | null
  >(null);

  // Get actorId from URL
  const getActorIdFromUrl = () => {
    const pathParts = window.location.pathname.split('/');
    const actorIdIndex = pathParts.indexOf('remote-users') + 1;
    return pathParts[actorIdIndex];
  };

  const fetchData = async (createdAt: Instant | undefined) => {
    const actorId = getActorIdFromUrl();
    if (!actorId) return;

    const res = await client.v1['remote-users'][':actorId'].posts.$get({
      param: { actorId },
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

  useEffect(() => {
    if (!init) {
      setInit(true);
      fetchData(undefined);
    }
  }, [init]);

  if (data === null) {
    return <div class='text-gray-500 dark:text-gray-400'>Loading...</div>;
  }

  if ('error' in data) {
    return <div class='text-red-500'>Error: {data.error}</div>;
  }

  return (
    <RemoteUserPage
      remoteActor={data.remoteActor}
      posts={data.posts}
      isFollowing={data.isFollowing}
      isLoggedIn={data.isLoggedIn}
      fetchData={fetchData}
      onLike={handleLike}
      likingPostUri={likingPostUri}
    />
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
