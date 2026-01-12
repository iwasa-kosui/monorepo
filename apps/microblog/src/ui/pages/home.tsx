import type { Post } from "../../domain/post/post.ts";
import type { User } from "../../domain/user/user.ts";
import type { Username } from "../../domain/user/username.ts";
import { Layout } from "../../layout.tsx";
import { PostView } from "../components/PostView.tsx";

type Props = Readonly<{
  user: User;
  posts: ReadonlyArray<Post & { username: Username }>;
}>;

export const HomePage = ({ user, posts }: Props) => {
  return (
    <Layout>
      <section>
        <h1>Hi, {String(user.username)}</h1>
        <form method="post" action="/posts">
          <textarea
            name="content"
            rows={4}
            cols={50}
            placeholder="What's on your mind?"
            required
          ></textarea>
          <button type="submit">Create</button>
        </form>
      </section>
      <section>
        {posts.map((post) => (
          <PostView post={post} />
        ))}
      </section>
    </Layout>
  );
};
