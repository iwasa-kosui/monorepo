import { RA } from "@iwasa-kosui/result";
import { PostNotFoundError, type Post, type PostResolver } from "../domain/post/post.ts";
import type { PostId } from "../domain/post/postId.ts";
import type { UseCase } from "./useCase.ts";

type Input = Readonly<{
  postId: PostId;
}>;
type Ok = Post;
type Err = PostNotFoundError
type GetPostUseCase = UseCase<Input, Ok, Err>;
type Deps = Readonly<{
  postResolver: PostResolver;
}>;

const create = ({ postResolver }: Deps): GetPostUseCase => {
  const resolvePost = (postId: PostId): RA<Post, PostNotFoundError> =>
    RA.flow(
      postResolver.resolve(postId),
      RA.andThen((post) => (post ? RA.ok(post) : RA.err(PostNotFoundError.create(postId))))
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind("post", ({ postId }) => resolvePost(postId)),
      RA.map(({ post }) => post)
    );

  return { run };
};

export const GetPostUseCase = {
  create,
} as const;
