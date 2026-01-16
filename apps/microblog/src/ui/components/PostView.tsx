import type { PostWithAuthor } from "../../domain/post/post.ts";
import type { UserId } from "../../domain/user/userId.ts";

type Props = Readonly<{
  post: PostWithAuthor;
  onLike?: (objectUri: string) => void;
  isLiking?: boolean;
  onDelete?: (postId: string) => void;
  isDeleting?: boolean;
  currentUserId?: UserId;
}>;

export const PostView = ({ post, onLike, isLiking, onDelete, isDeleting, currentUserId }: Props) => {
  const isRemotePost = post.type === "remote" && "uri" in post;
  const isLocalPost = post.type === "local";
  const isOwner = isLocalPost && currentUserId && post.userId === currentUserId;

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

  const handleDeleteClick = () => {
    if (isOwner && onDelete && !isDeleting) {
      if (confirm("Are you sure you want to delete this post?")) {
        onDelete(post.postId);
      }
    }
  };

  return (
    <article class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
      <div class="flex items-start gap-3">
        <a
          href={isLocalPost ? `/users/${post.username}` : isRemotePost ? `/remote-users/${post.actorId}` : undefined}
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
              href={isLocalPost ? `/users/${post.username}` : isRemotePost ? `/remote-users/${post.actorId}` : undefined}
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
          {post.images && post.images.length > 0 && (
            <div class={`mt-3 grid gap-2 ${post.images.length === 1 ? 'grid-cols-1' : post.images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
              {post.images.map((image, index) => (
                <a
                  key={index}
                  href={image.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block overflow-hidden rounded-lg"
                >
                  <img
                    src={image.url}
                    alt={image.altText || "Post image"}
                    class="w-full h-auto max-h-80 object-cover hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
          <div class="mt-3 flex items-center gap-4">
            {isRemotePost && (
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
            )}
            {isOwner && (
              <button
                type="button"
                onClick={handleDeleteClick}
                class={`flex items-center gap-1 transition-colors ${
                  isDeleting
                    ? "text-gray-300 dark:text-gray-600 cursor-wait"
                    : "text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                }`}
                title={isDeleting ? "Deleting..." : "Delete this post"}
                disabled={isDeleting}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                <span class="text-sm">
                  {isDeleting ? "Deleting..." : "Delete"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
