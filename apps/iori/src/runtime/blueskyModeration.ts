import { createBlueskyModerationReader } from '../adaptor/bluesky/blueskyModerationReader.ts';
import { createD1BlueskyModeratedActorsResolver } from '../adaptor/d1/blueskyModeration/blueskyModeratedActorsResolver.ts';
import {
  createD1BlueskyBlockDeletedStore,
  createD1BlueskyBlockSavedStore,
  createD1BlueskyMuteDeletedStore,
  createD1BlueskyMuteSavedStore,
} from '../adaptor/d1/blueskyModeration/blueskyModeratedActorsStore.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { Instant } from '../domain/instant/instant.ts';
import { BlockBlueskyActorUseCase } from '../useCase/blockBlueskyActor.ts';
import { GetBlueskyModerationStateUseCase } from '../useCase/getBlueskyModerationState.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { MuteBlueskyActorUseCase } from '../useCase/muteBlueskyActor.ts';
import { MuteBlueskyThreadUseCase } from '../useCase/muteBlueskyThread.ts';
import { ReportBlueskyActorUseCase } from '../useCase/reportBlueskyActor.ts';
import { UnblockBlueskyActorUseCase } from '../useCase/unblockBlueskyActor.ts';
import { UnmuteBlueskyActorUseCase } from '../useCase/unmuteBlueskyActor.ts';
import { UnmuteBlueskyThreadUseCase } from '../useCase/unmuteBlueskyThread.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createTimelineClient, resolveBlueskyTimelineConfig } from './blueskyTimeline.ts';

export type BlueskyModerationUseCases = Readonly<{
  getState: GetBlueskyModerationStateUseCase;
  mute: MuteBlueskyActorUseCase;
  unmute: UnmuteBlueskyActorUseCase;
  muteThread: MuteBlueskyThreadUseCase;
  unmuteThread: UnmuteBlueskyThreadUseCase;
  block: BlockBlueskyActorUseCase;
  unblock: UnblockBlueskyActorUseCase;
  report: ReportBlueskyActorUseCase;
}>;

export type BlueskyModerationRuntimePorts = Readonly<{
  blueskyModeration: BlueskyModerationUseCases | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export const createBlueskyModerationUseCases = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyModerationUseCases | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(config, db, deps);
  const reader = createBlueskyModerationReader({ client });
  const resolver = createD1BlueskyModeratedActorsResolver(db);
  const now = Instant.now;
  return {
    getState: GetBlueskyModerationStateUseCase.create({
      reader,
      resolver,
      muteSavedStore: createD1BlueskyMuteSavedStore(db),
      muteDeletedStore: createD1BlueskyMuteDeletedStore(db),
      blockSavedStore: createD1BlueskyBlockSavedStore(db),
      blockDeletedStore: createD1BlueskyBlockDeletedStore(db),
      now,
    }),
    mute: MuteBlueskyActorUseCase.create({ client, savedStore: createD1BlueskyMuteSavedStore(db), now }),
    unmute: UnmuteBlueskyActorUseCase.create({ client, deletedStore: createD1BlueskyMuteDeletedStore(db), now }),
    muteThread: MuteBlueskyThreadUseCase.create({ client }),
    unmuteThread: UnmuteBlueskyThreadUseCase.create({ client }),
    block: BlockBlueskyActorUseCase.create({
      client,
      reader,
      resolver,
      savedStore: createD1BlueskyBlockSavedStore(db),
      now,
    }),
    unblock: UnblockBlueskyActorUseCase.create({
      client,
      reader,
      resolver,
      deletedStore: createD1BlueskyBlockDeletedStore(db),
      now,
    }),
    report: ReportBlueskyActorUseCase.create({ client }),
  };
};

export const createBlueskyModerationRuntimePorts = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyModerationRuntimePorts => ({
  blueskyModeration: createBlueskyModerationUseCases(env, db, deps),
  isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
});
