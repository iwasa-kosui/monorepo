import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUri } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Post, type PostResolverByUri, type RemotePost, type RemotePostPollUpdatedStore } from '../domain/post/post.ts';
import type { RemotePostPoll } from '../domain/post/remotePostPoll.ts';
import { RemotePostUpdateAuthorMismatchError } from './updateRemotePost.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  uri: string;
  actorUri: string;
  poll: RemotePostPoll;
}>;

type Ok = Readonly<
  | { type: 'updated'; post: RemotePost }
  | { type: 'postNotFound' }
>;

type Err = RemotePostUpdateAuthorMismatchError;

export type UpdateRemotePostPollUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  postResolverByUri: PostResolverByUri;
  actorResolverByUri: ActorResolverByUri;
  remotePostPollUpdatedStore: RemotePostPollUpdatedStore;
}>;

const create = ({
  postResolverByUri,
  actorResolverByUri,
  remotePostPollUpdatedStore,
}: Deps): UpdateRemotePostPollUseCase => {
  const run = async (input: Input) => {
    const existing = await postResolverByUri.resolve({ uri: input.uri });
    if (!existing.ok) throw new Error(`Failed to resolve the remote post for ${input.uri}`);
    const post = existing.val;
    if (!post) return RA.ok<Ok>({ type: 'postNotFound' });

    const authorResult = await actorResolverByUri.resolve(input.actorUri);
    if (!authorResult.ok) throw new Error(`Failed to resolve the actor ${input.actorUri}`);
    if (authorResult.val?.id !== post.actorId) {
      return RA.err(RemotePostUpdateAuthorMismatchError.create({ uri: input.uri, actorUri: input.actorUri }));
    }

    const event = Post.updateRemotePostPoll(Instant.now())(post, input.poll);
    const stored = await remotePostPollUpdatedStore.store(event);
    if (!stored.ok) throw new Error(`Failed to store the poll of ${input.uri}`);
    return RA.ok<Ok>({ type: 'updated', post: event.aggregateState });
  };

  return { run };
};

export const UpdateRemotePostPollUseCase = {
  create,
} as const;
