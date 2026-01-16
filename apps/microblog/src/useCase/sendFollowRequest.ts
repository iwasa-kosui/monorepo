import { Follow, type RequestContext } from "@fedify/fedify";
import { RA } from "@iwasa-kosui/result";

import { ActorIdentity, ParseActorIdentityError } from "../adaptor/fedify/actorIdentity.ts";
import type {
  RemoteActorLookup,
  RemoteActorLookupError,
} from "../adaptor/fedify/remoteActorLookup.ts";
import type { ActorResolverByUserId } from "../domain/actor/actor.ts";
import type { RemoteActorCreatedStore } from "../domain/actor/remoteActor.ts";
import type { LogoUriUpdatedStore } from "../domain/actor/updateLogoUri.ts";
import {
  Follow as AppFollow,
  type FollowRequestedStore,
} from "../domain/follow/follow.ts";
import { Instant } from "../domain/instant/instant.ts";
import {
  SessionExpiredError,
  type SessionResolver,
} from "../domain/session/session.ts";
import type { SessionId } from "../domain/session/sessionId.ts";
import {
  UserNotFoundError,
  type UserResolver,
} from "../domain/user/user.ts";
import {
  resolveLocalActorWith,
  resolveSessionWith,
  resolveUserWith,
} from "./helper/resolve.ts";
import { upsertRemoteActor } from "./helper/upsertRemoteActor.ts";
import type { UseCase } from "./useCase.ts";

type Input = Readonly<{
  sessionId: SessionId;
  handle: string;
  request: Request;
  ctx: RequestContext<unknown>;
}>;

type Ok = void;

type Err = SessionExpiredError | UserNotFoundError | RemoteActorLookupError | ParseActorIdentityError

export type SendFollowRequestUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  remoteActorLookup: RemoteActorLookup;
  followRequestedStore: FollowRequestedStore;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  remoteActorLookup,
  followRequestedStore,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
}: Deps): SendFollowRequestUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind("session", ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind("user", ({ session }) => resolveUser(session.userId)),
      RA.andBind("followingFedifyActor", ({ user, request, handle }) =>
        remoteActorLookup.lookup({
          request,
          handle,
          identifier: user.username,
        })
      ),
      RA.andBind("follower", ({ user }) => resolveLocalActor(user.id)),
      RA.andBind("following", ({ followingFedifyActor }) =>
        RA.flow(
          ActorIdentity.fromFedifyActor(followingFedifyActor),
          RA.andThen(
            upsertRemoteActor({
              now,
              remoteActorCreatedStore,
              logoUriUpdatedStore,
            })
          )
        )
      ),
      RA.andThrough(async ({ follower, following }) => {
        const followRequested = AppFollow.requestFollow(
          {
            followerId: follower.id,
            followingId: following.id,
          },
          now
        );
        return followRequestedStore.store(followRequested);
      }),
      RA.andThrough(async ({ user, followingFedifyActor, ctx }) => {
        await ctx.sendActivity(
          { username: user.username },
          followingFedifyActor,
          new Follow({
            actor: ctx.getActorUri(user.username),
            object: followingFedifyActor.id,
            to: followingFedifyActor.id,
          })
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const SendFollowRequestUseCase = {
  create,
} as const;
