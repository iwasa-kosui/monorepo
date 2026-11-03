import { RA } from '@iwasa-kosui/result';

import { ActorIdentity, ParseActorIdentityError } from '../adaptor/fedify/actorIdentity.ts';
import type { RemoteActorLookup, RemoteActorLookupError } from '../adaptor/fedify/remoteActorLookup.ts';
import type { ActorResolverByUri } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { resolveUserWith } from './helper/resolve.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  handle: string;
  request: Request;
}>;

type Err = UserNotFoundError | RemoteActorLookupError | ParseActorIdentityError;

export type ResolveRemoteAccountUseCase = UseCase<Input, ActorId, Err>;

type Deps = Readonly<{
  userResolver: UserResolver;
  remoteActorLookup: RemoteActorLookup;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
}>;

const create = ({
  userResolver,
  remoteActorLookup,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
}: Deps): ResolveRemoteAccountUseCase => {
  const resolveUser = resolveUserWith(userResolver);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', ({ userId }) => resolveUser(userId)),
      RA.andBind('fedifyActor', ({ user, request, handle }) =>
        remoteActorLookup.lookup({ request, handle, identifier: user.username })),
      RA.andThen(({ fedifyActor }) =>
        RA.flow(
          ActorIdentity.fromFedifyActor(fedifyActor),
          RA.andThen(
            upsertRemoteActor({ now: Instant.now(), remoteActorCreatedStore, logoUriUpdatedStore, actorResolverByUri }),
          ),
        )
      ),
      RA.map((actor) =>
        actor.id
      ),
    );

  return { run };
};

export const ResolveRemoteAccountUseCase = { create } as const;
