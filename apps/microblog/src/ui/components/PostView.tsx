import type { PostWithAuthor } from "../../domain/post/post.ts";

type Props = Readonly<{
  post: PostWithAuthor;
}>;

export const PostView = ({ post }: Props) => (
  <article class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
    <div class="flex items-start gap-3">
      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
        {post.logoUri ? (
          <img
            src={post.logoUri}
            alt="Author Logo"
            class="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          String(post.username).charAt(0).toUpperCase()
        )}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-gray-900 dark:text-white">
            @{post.username}
          </span>
          <span class="text-gray-400 dark:text-gray-500">·</span>
          <time
            dateTime={new Date(post.createdAt).toISOString()}
            class="text-sm text-gray-500 dark:text-gray-400"
          >
            {new Date(post.createdAt).toLocaleString()}
          </time>
        </div>
        <div
          class="mt-2 text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline  [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 break-words [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 dark:[&_blockquote]:border-gray-600 dark:[&_blockquote]:text-gray-400 [&_blockquote]:dark:mb-4"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </div>
    </div>
  </article>
);
