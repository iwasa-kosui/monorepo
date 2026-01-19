import { hc } from 'hono/client';
import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { Actor } from '../../domain/actor/actor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';
import type { User } from '../../domain/user/user.ts';
import { ActorLink } from '../components/ActorLink.tsx';
import { Modal } from '../components/Modal.tsx';
import { PostForm } from '../components/PostForm.tsx';
import { PostView } from '../components/PostView.tsx';

const client = hc<APIRouterType>('/api');

type Props = Readonly<{
  user: User;
  timelineItems: ReadonlyArray<TimelineItemWithPost>;
  actor: Actor;
  followers: ReadonlyArray<Actor>;
  following: ReadonlyArray<Actor>;
  fetchData: (createdAt: Instant | undefined) => Promise<void>;
  onLike: (objectUri: string) => Promise<void>;
  likingPostUri: string | null;
  onRepost: (objectUri: string) => Promise<void>;
  repostingPostUri: string | null;
  onDelete: (postId: string) => Promise<void>;
  deletingPostId: string | null;
  onEmojiReact: (objectUri: string, emoji: string) => Promise<void>;
  onUndoEmojiReact: (objectUri: string, emoji: string) => Promise<void>;
  emojiReactingUri: string | null;
  myReactions: ReadonlyMap<string, readonly string[]>;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  emojiPickerOpenForIndex: number | null;
  setEmojiPickerOpenForIndex: (index: number | null) => void;
}>;

export const HomePage = ({
  user,
  timelineItems,
  actor,
  followers,
  following,
  fetchData,
  onLike,
  likingPostUri,
  onRepost,
  repostingPostUri,
  onDelete,
  deletingPostId,
  onEmojiReact,
  onUndoEmojiReact,
  emojiReactingUri,
  myReactions,
  selectedIndex,
  setSelectedIndex,
  emojiPickerOpenForIndex,
  setEmojiPickerOpenForIndex,
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

  // Scroll selected post into view
  const scrollToSelected = (index: number) => {
    const postElements = document.querySelectorAll('[data-post-index]');
    const targetElement = postElements[index] as HTMLElement | undefined;
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea, or contenteditable
      const activeElement = document.activeElement as HTMLElement | null;
      if (
        activeElement
        && (activeElement.tagName === 'INPUT'
          || activeElement.tagName === 'TEXTAREA'
          || activeElement.isContentEditable)
      ) {
        return;
      }

      const selectedItem = timelineItems[selectedIndex];
      if (!selectedItem) return;

      const post = selectedItem.post;
      const isRemotePost = post.type === 'remote' && 'uri' in post;

      switch (e.key) {
        case 'j': // Move down
          e.preventDefault();
          if (selectedIndex < timelineItems.length - 1) {
            const newIndex = selectedIndex + 1;
            setSelectedIndex(newIndex);
            scrollToSelected(newIndex);
          }
          break;
        case 'k': // Move up
          e.preventDefault();
          if (selectedIndex > 0) {
            const newIndex = selectedIndex - 1;
            setSelectedIndex(newIndex);
            scrollToSelected(newIndex);
          }
          break;
        case 'l': // Like selected post
          e.preventDefault();
          if (isRemotePost && !post.liked && !likingPostUri) {
            onLike(post.uri);
          }
          break;
        case 'r': // Repost selected post
          e.preventDefault();
          if (isRemotePost && !repostingPostUri) {
            onRepost(post.uri);
          }
          break;
        case 'o': // Open selected post
        case 'Enter':
          e.preventDefault();
          if (post.type === 'local') {
            window.location.href = `/users/${post.username}/posts/${post.postId}`;
          } else if (isRemotePost) {
            window.open(post.uri, '_blank');
          }
          break;
        case 'g': // Go to top (gg in vim, but we use single g)
          e.preventDefault();
          setSelectedIndex(0);
          scrollToSelected(0);
          break;
        case 'G': { // Go to bottom (Shift+G)
          e.preventDefault();
          const lastIndex = timelineItems.length - 1;
          setSelectedIndex(lastIndex);
          scrollToSelected(lastIndex);
          break;
        }
        case 'e': { // Open emoji picker for selected post
          e.preventDefault();
          if (isRemotePost) {
            setEmojiPickerOpenForIndex(
              emojiPickerOpenForIndex === selectedIndex ? null : selectedIndex,
            );
          }
          break;
        }
        case 'Escape': { // Close emoji picker
          if (emojiPickerOpenForIndex !== null) {
            e.preventDefault();
            setEmojiPickerOpenForIndex(null);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, timelineItems, likingPostUri, repostingPostUri, emojiPickerOpenForIndex]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.body.scrollHeight;
      const scrollTop = document.body.scrollTop;
      const clientHeight = document.body.clientHeight;
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        const oldest = timelineItems.reduce((prev, curr) =>
          new Date(prev.createdAt) < new Date(curr.createdAt) ? prev : curr
        );
        debouncedFetchData(oldest.createdAt);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [timelineItems]);
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
                  {timelineItems.length}
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
        {timelineItems.map((item, index) => {
          const postUri = item.post.type === 'remote' && 'uri' in item.post ? item.post.uri : null;
          return (
            <PostView
              key={item.timelineItemId}
              post={item.post}
              repostedBy={item.type === 'repost' ? item.repostedBy : undefined}
              onLike={onLike}
              isLiking={postUri !== null && likingPostUri === postUri}
              onRepost={onRepost}
              isReposting={postUri !== null && repostingPostUri === postUri}
              onDelete={onDelete}
              isDeleting={deletingPostId === item.post.postId}
              onEmojiReact={onEmojiReact}
              onUndoEmojiReact={onUndoEmojiReact}
              isEmojiReacting={postUri !== null && emojiReactingUri === postUri}
              myReactions={postUri ? myReactions.get(postUri) ?? [] : []}
              currentUserId={user.id}
              isSelected={selectedIndex === index}
              dataIndex={index}
              isEmojiPickerOpen={emojiPickerOpenForIndex === index}
              onToggleEmojiPicker={() => setEmojiPickerOpenForIndex(emojiPickerOpenForIndex === index ? null : index)}
            />
          );
        })}
      </section>
      <script src='https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js'></script>
    </>
  );
};

const App = () => {
  const [init, setInit] = useState(false);
  const [likingPostUri, setLikingPostUri] = useState<string | null>(null);
  const [repostingPostUri, setRepostingPostUri] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [emojiReactingUri, setEmojiReactingUri] = useState<string | null>(null);
  const [myReactions, setMyReactions] = useState<Map<string, string[]>>(new Map());
  const [emojiPickerOpenForIndex, setEmojiPickerOpenForIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [data, setData] = useState<
    | { error: string }
    | {
      user: User;
      actor: Actor;
      timelineItems: readonly TimelineItemWithPost[];
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
        timelineItems: [...data.timelineItems, ...latest.timelineItems],
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
            timelineItems: data.timelineItems.map((item) =>
              item.post.type === 'remote' && 'uri' in item.post && item.post.uri === objectUri
                ? { ...item, post: { ...item.post, liked: true } }
                : item
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

  const handleRepost = async (objectUri: string) => {
    setRepostingPostUri(objectUri);
    try {
      const res = await client.v1.repost.$post({
        json: { objectUri },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Refresh the timeline to show the repost
        fetchData(undefined);
      } else if ('error' in result) {
        console.error('Failed to repost:', result.error);
        alert(`Failed to repost: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to repost:', error);
      alert('Failed to repost. Please try again.');
    } finally {
      setRepostingPostUri(null);
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
        // Remove the timeline item from the local state
        if (data && !('error' in data)) {
          setData({
            ...data,
            timelineItems: data.timelineItems.filter((item) => item.post.postId !== postId),
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

  const handleEmojiReact = async (objectUri: string, emoji: string) => {
    setEmojiReactingUri(objectUri);
    try {
      const res = await client.v1.react.$post({
        json: { objectUri, emoji },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Add the reaction to local state
        setMyReactions((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(objectUri) ?? [];
          if (!existing.includes(emoji)) {
            newMap.set(objectUri, [...existing, emoji]);
          }
          return newMap;
        });
      } else if ('error' in result) {
        console.error('Failed to react:', result.error);
        alert(`Failed to react: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to react:', error);
      alert('Failed to add reaction. Please try again.');
    } finally {
      setEmojiReactingUri(null);
    }
  };

  const handleUndoEmojiReact = async (objectUri: string, emoji: string) => {
    setEmojiReactingUri(objectUri);
    try {
      const res = await client.v1.react.$delete({
        json: { objectUri, emoji },
      });
      const result = await res.json();
      if ('success' in result && result.success) {
        // Remove the reaction from local state
        setMyReactions((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(objectUri) ?? [];
          newMap.set(objectUri, existing.filter((e) => e !== emoji));
          return newMap;
        });
      } else if ('error' in result) {
        console.error('Failed to undo react:', result.error);
        alert(`Failed to undo reaction: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to undo react:', error);
      alert('Failed to remove reaction. Please try again.');
    } finally {
      setEmojiReactingUri(null);
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
      timelineItems={data.timelineItems}
      followers={data.followers}
      following={data.following}
      fetchData={fetchData}
      onLike={handleLike}
      likingPostUri={likingPostUri}
      onRepost={handleRepost}
      repostingPostUri={repostingPostUri}
      onDelete={handleDelete}
      deletingPostId={deletingPostId}
      onEmojiReact={handleEmojiReact}
      onUndoEmojiReact={handleUndoEmojiReact}
      emojiReactingUri={emojiReactingUri}
      myReactions={myReactions}
      selectedIndex={selectedIndex}
      setSelectedIndex={setSelectedIndex}
      emojiPickerOpenForIndex={emojiPickerOpenForIndex}
      setEmojiPickerOpenForIndex={setEmojiPickerOpenForIndex}
    />
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<App />, root);
}
