import { sanitize } from "../../adaptor/routes/helper/sanitize.ts";
import type { Post } from "../../domain/post/post.ts";
import type { Username } from "../../domain/user/username.ts";

type Props = Readonly<{
  post: Post & { username: Username };
}>;

export const PostView = ({ post }: Props) => (
  <article>
    <span>@{post.username}</span>
    <div dangerouslySetInnerHTML={{ __html: sanitize(post.content) }} />
    <time dateTime={new Date(post.createdAt).toISOString()}>
      {new Date(post.createdAt).toLocaleString()}
    </time>
  </article>
);
