import { useEffect, useState } from "hono/jsx";
import type { Actor } from "../../domain/actor/actor.ts";
import type { PostWithAuthor } from "../../domain/post/post.ts";
import type { User } from "../../domain/user/user.ts";
import { ActorLink } from "../components/ActorLink.tsx";
import { Modal } from "../components/Modal.tsx";
import { PostView } from "../components/PostView.tsx";
import { render } from "hono/jsx/dom";
import { hc } from "hono/client";
import type { getHomeApiRouter } from "../../adaptor/routes/homeRouter.tsx";

const client = hc<typeof getHomeApiRouter>("/");

type Props = Readonly<{
  user: User;
  posts: ReadonlyArray<PostWithAuthor>;
  actor: Actor;
  followers: ReadonlyArray<Actor>;
  following: ReadonlyArray<Actor>;
  fetchData: (createdAt: string | undefined) => Promise<void>;
}>;

export const HomePage = ({
  user,
  posts,
  actor,
  followers,
  following,
  fetchData,
}: Props) => {
  const url = new URL(actor.uri);
  const handle = `@${user.username}@${url.host}`;
  const debounce = (func: Function, wait: number) => {
    let timeoutId: NodeJS.Timeout | undefined;
    return (...args: unknown[]) => {
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
        const oldest = posts.reduce((prev, curr) =>
          new Date(prev.createdAt) < new Date(curr.createdAt) ? prev : curr
        );
        debouncedFetchData(oldest.createdAt);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [posts]);
  return (
    <>
      <section class="mb-8">
        <header class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Hi, {String(user.username)}
          </h1>
          <button>
            <a
              href="#update-bio"
              class="text-blue-600 hover:text-blue-800 font-semibold"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 inline-block mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v1m0 14v1m8-8h1M4 12H3m15.364-6.364l.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
                />
              </svg>
            </a>
          </button>
        </header>
        <section class="mb-8">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                {actor.logoUri ? (
                  <img
                    src={actor.logoUri}
                    alt="User Logo"
                    class="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  String(user.username).charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                  {String(user.username)}
                </h1>
                <p class="text-gray-500 dark:text-gray-400">{handle}</p>
              </div>
            </div>

            <div class="flex gap-6 text-sm border-t border-gray-200 dark:border-gray-700 pt-4">
              <div>
                <span class="font-semibold text-gray-900 dark:text-white">
                  {followers.length}
                </span>
                <a
                  class="text-gray-500 dark:text-gray-400 ml-1"
                  href="#followers"
                >
                  Followers
                </a>
              </div>
              <div>
                <span class="font-semibold text-gray-900 dark:text-white">
                  {following.length}
                </span>
                <a
                  class="text-gray-500 dark:text-gray-400 ml-1"
                  href="#following"
                >
                  Following
                </a>
              </div>
              <div>
                <span class="font-semibold text-gray-900 dark:text-white">
                  {posts.length}
                </span>
                <span class="text-gray-500 dark:text-gray-400 ml-1">Posts</span>
              </div>
            </div>
          </div>

          <div>
            <Modal id="followers">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Followers
              </h2>
              {followers.length > 0 ? (
                <div class="space-y-1 max-h-48 overflow-y-auto">
                  {followers.map((follower) => (
                    <ActorLink key={follower.id} actor={follower} />
                  ))}
                </div>
              ) : (
                <p class="text-gray-500 dark:text-gray-400 text-sm">
                  No followers yet
                </p>
              )}
            </Modal>

            <Modal id="following">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Following
              </h2>
              {following.length > 0 ? (
                <div class="space-y-1 max-h-48 overflow-y-auto">
                  {following.map((followed) => (
                    <ActorLink key={followed.id} actor={followed} />
                  ))}
                </div>
              ) : (
                <p class="text-gray-500 dark:text-gray-400 text-sm">
                  Not following anyone yet
                </p>
              )}
            </Modal>
          </div>
        </section>

        <form
          id="post"
          method="post"
          action="/posts"
          class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
        >
          <textarea
            name="content"
            rows={4}
            placeholder="What's on your mind?"
            required
            class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <div
            class="mt-2 text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5"
            id="post-preview"
          />
          <div class="mt-3 flex justify-end">
            <button
              type="submit"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Post
            </button>
          </div>
        </form>
      </section>
      <a
        class="rounded-full p-4 bg-gray-600 hover:bg-gray-500 text-white block fixed bottom-8 right-8 shadow-lg transition-colors"
        href="#post-modal"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-12 w-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
      </a>
      <Modal
        id="post-modal"
        showCloseButton={false}
        actions={
          <a href="#" class="text-blue-500 hover:underline">
            <button
              onClick={() => {
                const form = document.getElementById(
                  "post-modal-form"
                ) as HTMLFormElement | null;
                form?.submit();
              }}
              class="mt-4 px-4 py-2 text-white rounded-lg bg-blue-700 hover:bg-blue-600 transition-colors"
            >
              Post
            </button>
          </a>
        }
      >
        <form method="post" action="/posts" id="post-modal-form">
          <textarea
            name="content"
            rows={4}
            placeholder="What's on your mind?"
            required
            class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <div
            class="mt-2 text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5"
            id="post-modal-preview"
          />
        </form>
      </Modal>
      <div class="hidden target:block" id="update-bio">
        <form method="post" class="mb-4" action={`/users/${user.username}`}>
          <label
            for="logoUri"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Profile Image URL
          </label>
          <div class="flex gap-2">
            <input
              type="url"
              name="logoUri"
              id="logoUri"
              placeholder="https://example.com/image.png"
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Update
            </button>
          </div>
        </form>
      </div>
      <section class="space-y-4">
        {posts.map((post) => (
          <PostView post={post} />
        ))}
      </section>
      <script src="https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js"></script>
      <script
        dangerouslySetInnerHTML={{
          __html: `
        document.addEventListener('DOMContentLoaded', () => {
          const textarea = document.querySelector('#post-modal textarea');
          const preview = document.getElementById('post-modal-preview');
          textarea.oninput = (e) => {
            console.log(e.target.value);
            const rawHtml = marked.parse(e.target.value, { async: false });
            preview.innerHTML = rawHtml;
          };
        });
      `,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
        document.addEventListener('DOMContentLoaded', () => {
          const textarea = document.querySelector('#post textarea');
          const preview = document.getElementById('post-preview');
          textarea.oninput = (e) => {
            console.log(e.target.value);
            const rawHtml = marked.parse(e.target.value, { async: false });
            preview.innerHTML = rawHtml;
          };
        });
      `,
        }}
      />
    </>
  );
};

const App = () => {
  const [init, setInit] = useState(false);
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
  const fetchData = async (createdAt: string | undefined) => {
    const res = await client.api.v1.home.$get({
      query: { createdAt },
    });
    const latest = await res.json();
    if (latest && !("error" in latest) && data && !("error" in data)) {
      setData({
        ...latest,
        posts: [...data.posts, ...latest.posts],
      });
    } else {
      setData(latest);
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
  if ("error" in data) {
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
    />
  );
};

if (globalThis.window) {
  const root = document.getElementById("root")!;
  render(<App />, root);
}
