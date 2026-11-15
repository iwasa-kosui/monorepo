import { createBlueskyModerationReader } from '../adaptor/bluesky/blueskyModerationReader.ts';
import { createBlueskyThreadRootResolver } from '../adaptor/bluesky/blueskyThreadRootResolver.ts';
import { createD1BlueskyModeratedActorsResolver } from '../adaptor/d1/blueskyModeration/blueskyModeratedActorsResolver.ts';
import {
  createD1BlueskyBlockDeletedStore,
  createD1BlueskyBlockSavedStore,
  createD1BlueskyMuteDeletedStore,
  createD1BlueskyMuteSavedStore,
} from '../adaptor/d1/blueskyModeration/blueskyModeratedActorsStore.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import { Instant } from '../domain/instant/instant.ts';
import { BlockBlueskyActorUseCase } from '../useCase/blockBlueskyActor.ts';
import { GetBlueskyModerationStateUseCase } from '../useCase/getBlueskyModerationState.ts';
import { MuteBlueskyActorUseCase } from '../useCase/muteBlueskyActor.ts';
import { MuteBlueskyThreadUseCase } from '../useCase/muteBlueskyThread.ts';
import { ReportBlueskyActorUseCase } from '../useCase/reportBlueskyActor.ts';
import { UnblockBlueskyActorUseCase } from '../useCase/unblockBlueskyActor.ts';
import { UnmuteBlueskyActorUseCase } from '../useCase/unmuteBlueskyActor.ts';
import { UnmuteBlueskyThreadUseCase } from '../useCase/unmuteBlueskyThread.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { BlueskyAccountConfig } from './blueskyCredential.ts';
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
}>;

export const createBlueskyModerationUseCases = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyModerationUseCases | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(account, db, deps);
  const reader = createBlueskyModerationReader({ client });
  const resolver = createD1BlueskyModeratedActorsResolver(db, account.userId);
  const threadRootResolver = createBlueskyThreadRootResolver({ client });
  const now = Instant.now;
  return {
    getState: GetBlueskyModerationStateUseCase.create({
      reader,
      resolver,
      muteSavedStore: createD1BlueskyMuteSavedStore(db, account.userId),
      muteDeletedStore: createD1BlueskyMuteDeletedStore(db, account.userId),
      blockSavedStore: createD1BlueskyBlockSavedStore(db, account.userId),
      blockDeletedStore: createD1BlueskyBlockDeletedStore(db, account.userId),
      now,
    }),
    mute: MuteBlueskyActorUseCase.create({
      client,
      savedStore: createD1BlueskyMuteSavedStore(db, account.userId),
      now,
    }),
    unmute: UnmuteBlueskyActorUseCase.create({
      client,
      deletedStore: createD1BlueskyMuteDeletedStore(db, account.userId),
      now,
    }),
    muteThread: MuteBlueskyThreadUseCase.create({ client, threadRootResolver }),
    unmuteThread: UnmuteBlueskyThreadUseCase.create({ client, threadRootResolver }),
    block: BlockBlueskyActorUseCase.create({
      client,
      reader,
      resolver,
      savedStore: createD1BlueskyBlockSavedStore(db, account.userId),
      now,
    }),
    unblock: UnblockBlueskyActorUseCase.create({
      client,
      reader,
      resolver,
      deletedStore: createD1BlueskyBlockDeletedStore(db, account.userId),
      now,
    }),
    report: ReportBlueskyActorUseCase.create({ client }),
  };
};

export const createBlueskyModerationRuntimePorts = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyModerationRuntimePorts => ({
  blueskyModeration: createBlueskyModerationUseCases(env, account, db, deps),
});
