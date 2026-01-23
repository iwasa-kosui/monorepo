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
  isMuted: boolean;
  isLoggedIn: boolean;
  fetchData: (createdAt: Instant | undefined) => Promise<void>;
  onLike: (postId: string) => Promise<void>;
  onMute: () => Promise<void>;
  onUnmute: () => Promise<void>;
  likingPostId: string | null;
  isMuting: boolean;
}>;

export const RemoteUserPage = ({
  remoteActor,
  posts,
  isFollowing,
  isMuted,
  isLoggedIn,
  fetchData,
  onLike,
  onMute,
  onUnmute,
  likingPostId,
  isMuting,
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
        <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover blob-bg'>
          <div class='flex items-center gap-4 mb-4 relative z-10'>
            <div class='w-16 h-16 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-clay-sm'>
              {remoteActor.logoUri
                ? (
                  <img
                    src={remoteActor.logoUri}
                    alt='User Logo'
                    class='w-16 h-16 blob-avatar object-cover'
                  />
                )
                : (
                  displayName.charAt(0).toUpperCase()
                )}
            </div>
            <div class='flex-1 min-w-0'>
              <h1 class='text-2xl font-bold text-charcoal dark:text-white truncate'>
                {displayName}
              </h1>
              <p class='text-charcoal-light dark:text-gray-400 truncate'>@{handle}</p>
            </div>
          </div>

          <div class='flex items-center gap-3'>
            {isLoggedIn
              ? (
                <>
                  {isFollowing
                    ? (
                      <form
                        method='post'
                        action={`/remote-users/${remoteActor.id}/unfollow`}
                        class='m-0'
                      >
                        <button
                          type='submit'
                          class='flex items-center justify-center p-2 rounded-xl text-sage-dark dark:text-sage hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
                          title='フォロー解除'
                        >
                          <svg
                            xmlns='http://www.w3.org/2000/svg'
                            class='h-5 w-5'
                            fill='none'
                            viewBox='0 0 24 24'
                            stroke='currentColor'
                            stroke-width='2'
                          >
                            <path
                              stroke-linecap='round'
                              stroke-linejoin='round'
                              d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                            />
                            <path
                              stroke-linecap='round'
                              stroke-linejoin='round'
                              d='M15 11l2 2 4-4'
                            />
                          </svg>
                        </button>
                      </form>
                    )
                    : (
                      <form
                        method='post'
                        action={`/remote-users/${remoteActor.id}/follow`}
                        class='m-0'
                      >
                        <button
                          type='submit'
                          class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-sage-dark dark:hover:text-sage hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
                          title='フォロー'
                        >
                          <svg
                            xmlns='http://www.w3.org/2000/svg'
                            class='h-5 w-5'
                            fill='none'
                            viewBox='0 0 24 24'
                            stroke='currentColor'
                            stroke-width='2'
                          >
                            <path
                              stroke-linecap='round'
                              stroke-linejoin='round'
                              d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                            />
                            <path
                              stroke-linecap='round'
                              stroke-linejoin='round'
                              d='M19 10h-2m-2 0h2m0 0V8m0 2v2'
                            />
                          </svg>
                        </button>
                      </form>
                    )}
                  {isMuted
                    ? (
                      <button
                        type='button'
                        onClick={onUnmute}
                        disabled={isMuting}
                        class='flex items-center justify-center p-2 rounded-xl text-terracotta dark:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
                        title='ミュート解除'
                      >
                        <svg
                          xmlns='http://www.w3.org/2000/svg'
                          class='h-5 w-5'
                          fill='none'
                          viewBox='0 0 24 24'
                          stroke='currentColor'
                          stroke-width='2'
                        >
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z'
                          />
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2'
                          />
                        </svg>
                      </button>
                    )
                    : (
                      <button
                        type='button'
                        onClick={onMute}
                        disabled={isMuting}
                        class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
                        title='ミュート'
                      >
                        <svg
                          xmlns='http://www.w3.org/2000/svg'
                          class='h-5 w-5'
                          fill='none'
                          viewBox='0 0 24 24'
                          stroke='currentColor'
                          stroke-width='2'
                        >
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z'
                          />
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2'
                          />
                        </svg>
                      </button>
                    )}
                </>
              )
              : (
                <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                  <a href='/sign-in' class='text-charcoal dark:text-gray-300 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'>
                    Sign in
                  </a>{' '}
                  to follow this user
                </p>
              )}
            {remoteActor.url && (
              <a
                href={remoteActor.url}
                target='_blank'
                rel='noopener noreferrer'
                class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
                title='元のプロフィールを表示'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  class='h-5 w-5'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  stroke-width='2'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
                  />
                </svg>
              </a>
            )}
          </div>
        </div>
      </section>

      <section class='space-y-6 py-2'>
        <h2 class='text-xl font-bold text-charcoal dark:text-white mb-4'>
          Posts
        </h2>
        {posts.length === 0 ? <p class='text-charcoal-light dark:text-gray-400'>No posts yet.</p> : (
          posts.map((post) => (
            <PostView
              key={post.postId}
              post={post}
              onLike={onLike}
              isLiking={likingPostId === post.postId}
            />
          ))
        )}
      </section>
    </>
  );
};

const App = () => {
  const [init, setInit] = useState(false);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [isMuting, setIsMuting] = useState(false);
  const [data, setData] = useState<
    | { error: string }
    | {
      remoteActor: RemoteActor;
      posts: readonly PostWithAuthor[];
      isFollowing: boolean;
      isMuted: boolean;
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

  const handleLike = async (postId: string) => {
    setLikingPostId(postId);
    try {
      const res = await client.v1.like.$post({
        json: { postId },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        if (data && !('error' in data)) {
          setData({
            ...data,
            posts: data.posts.map((post) =>
              post.postId === postId
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
      setLikingPostId(null);
    }
  };

  const handleMute = async () => {
    if (!data || 'error' in data) return;
    setIsMuting(true);
    try {
      const res = await client.v1.mute.$post({
        json: { actorId: data.remoteActor.id },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        setData({ ...data, isMuted: true });
      } else if ('error' in result) {
        console.error('Failed to mute:', result.error);
      }
    } catch (error) {
      console.error('Failed to mute:', error);
    } finally {
      setIsMuting(false);
    }
  };

  const handleUnmute = async () => {
    if (!data || 'error' in data) return;
    setIsMuting(true);
    try {
      const res = await client.v1.mute.$delete({
        json: { actorId: data.remoteActor.id },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        setData({ ...data, isMuted: false });
      } else if ('error' in result) {
        console.error('Failed to unmute:', result.error);
      }
    } catch (error) {
      console.error('Failed to unmute:', error);
    } finally {
      setIsMuting(false);
    }
  };

  useEffect(() => {
    if (!init) {
      setInit(true);
      fetchData(undefined);
    }
  }, [init]);

  if (data === null) {
    return <div class='text-charcoal-light dark:text-gray-400'>Loading...</div>;
  }

  if ('error' in data) {
    return <div class='text-red-500'>Error: {data.error}</div>;
  }

  return (
    <RemoteUserPage
      remoteActor={data.remoteActor}
      posts={data.posts}
      isFollowing={data.isFollowing}
      isMuted={data.isMuted}
      isLoggedIn={data.isLoggedIn}
      fetchData={fetchData}
      onLike={handleLike}
      onMute={handleMute}
      onUnmute={handleUnmute}
      likingPostId={likingPostId}
      isMuting={isMuting}
    />
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
