import type { PostWithAuthor } from "../../domain/post/post.ts";

type Props = Readonly<{
  post: PostWithAuthor;
  onLike?: (objectUri: string) => void;
  isLiking?: boolean;
}>;

export const PostView = ({ post, onLike, isLiking }: Props) => {
  const isRemotePost = post.type === "remote" && "uri" in post;
  const isLocalPost = post.type === "local";

  // Generate link to post detail page
  const postDetailLink = isLocalPost
    ? `/users/${post.username}/posts/${post.postId}`
    : isRemotePost
    ? post.uri
    : undefined;

  const handleLikeClick = () => {
    if (isRemotePost && onLike && !post.liked && !isLiking) {
      onLike(post.uri);
    }
  };

  return (
    <article class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
      <div class="flex items-start gap-3">
        <a
          href={isLocalPost ? `/users/${post.username}` : undefined}
          class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
        >
          {post.logoUri ? (
            <img
              src={post.logoUri}
              alt="Author Logo"
              class="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            String(post.username).charAt(0).toUpperCase()
          )}
        </a>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <a
              href={isLocalPost ? `/users/${post.username}` : undefined}
              class="font-semibold text-gray-900 dark:text-white hover:underline"
            >
              @{post.username}
            </a>
            <span class="text-gray-400 dark:text-gray-500">·</span>
            <a
              href={postDetailLink}
              target={isRemotePost ? "_blank" : undefined}
              rel={isRemotePost ? "noopener noreferrer" : undefined}
              class="text-sm text-gray-500 dark:text-gray-400 hover:underline"
            >
              <time dateTime={new Date(post.createdAt).toISOString()}>
                {new Date(post.createdAt).toLocaleString()}
              </time>
            </a>
          </div>
          <div
            class="mt-2 text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline  [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 break-words [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 dark:[&_blockquote]:border-gray-600 dark:[&_blockquote]:text-gray-400 [&_blockquote]:dark:mb-4"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
          {isRemotePost && (
            <div class="mt-3 flex items-center gap-4">
              <button
                type="button"
                onClick={handleLikeClick}
                class={`flex items-center gap-1 transition-colors ${
                  post.liked
                    ? "text-red-500 dark:text-red-400"
                    : isLiking
                    ? "text-pink-300 dark:text-pink-600 cursor-wait"
                    : "text-gray-500 hover:text-pink-500 dark:text-gray-400 dark:hover:text-pink-400"
                }`}
                title={post.liked ? "Already liked" : isLiking ? "Liking..." : "Like this post"}
                disabled={post.liked || isLiking}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill={post.liked ? "currentColor" : "none"}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                <span class="text-sm">
                  {post.liked ? "Liked" : isLiking ? "Liking..." : "Like"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
