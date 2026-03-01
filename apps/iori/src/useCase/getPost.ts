import { RA } from '@iwasa-kosui/result';

import type { PostImage, PostImagesResolverByPostId } from '../domain/image/image.ts';
import { type Post, PostNotFoundError, type PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  postId: PostId;
}>;
type Ok = { post: Post; postImages: PostImage[] };
type Err = PostNotFoundError;
type GetPostUseCase = UseCase<Input, Ok, Err>;
type Deps = Readonly<{
  postResolver: PostResolver;
  postImagesResolver: PostImagesResolverByPostId;
}>;

const create = ({ postResolver, postImagesResolver }: Deps): GetPostUseCase => {
  const resolvePost = (postId: PostId): RA<Post, PostNotFoundError> =>
    RA.flow(
      postResolver.resolve(postId),
      RA.andThen((post) => (post ? RA.ok(post) : RA.err(PostNotFoundError.create(postId)))),
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('post', ({ postId }) => resolvePost(postId)),
      RA.andBind('postImages', ({ post }) => postImagesResolver.resolve(post.postId)),
    );

  return { run };
};

export const GetPostUseCase = {
  create,
} as const;
