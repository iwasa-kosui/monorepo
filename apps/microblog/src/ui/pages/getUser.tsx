import sanitize from "sanitize-html";
import { Actor } from "../../domain/actor/actor.ts";
import { LocalActor } from "../../domain/actor/localActor.ts";
import { RemoteActor } from "../../domain/actor/remoteActor.ts";
import type { Post } from "../../domain/post/post.ts";
import type { User } from "../../domain/user/user.ts";
import { Layout } from "../../layout.tsx";

type Props = Readonly<{
  user: User;
  handle: string;
  followers: ReadonlyArray<Actor>;
  following: ReadonlyArray<Actor>;
  posts: ReadonlyArray<Post>;
}>;

export const GetUserPage = ({
  user,
  handle,
  followers,
  following,
  posts,
}: Props) => (
  <Layout>
    <section>
      <h1>{String(user.username)}</h1>
      <h4>{handle}</h4>
      <div>
        <h2>Followers</h2>
        {followers.length > 0 ? (
          <ul>
            {followers.map((follower) => (
              <li key={follower.id}>
                <a
                  href={Actor.match({
                    onLocal: (x) => x.uri,
                    onRemote: (x) => x.url ?? x.uri,
                  })(follower)}
                >
                  {Actor.match({
                    onLocal: LocalActor.getHandle,
                    onRemote: (x) => RemoteActor.getHandle(x) ?? follower.uri,
                  })(follower)}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No followers</p>
        )}
      </div>

      <div>
        <h2>Following</h2>
        {following.length > 0 ? (
          <ul>
            {following.map((followed) => (
              <li key={followed.id}>
                <a
                  href={Actor.match({
                    onLocal: (x) => x.uri,
                    onRemote: (x) => x.url ?? x.uri,
                  })(followed)}
                >
                  {Actor.match({
                    onLocal: LocalActor.getHandle,
                    onRemote: (x) => RemoteActor.getHandle(x) ?? followed.uri,
                  })(followed)}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No followers</p>
        )}
      </div>
    </section>
    <section>
      {posts.map((post) => (
        <article
          key={post.postId}
          style={{
            marginBottom: "1em",
            paddingBottom: "1em",
          }}
        >
          <div
            dangerouslySetInnerHTML={{
              __html: sanitize(post.content),
            }}
          />
          <footer>
            <a
              href={`/users/${user.username}/posts/${post.postId}`}
              class="secondary"
            >
              {new Date(post.createdAt).toLocaleString()}
            </a>
          </footer>
        </article>
      ))}
    </section>
  </Layout>
);
