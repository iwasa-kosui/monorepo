import { type RA, Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { BlueskyStoredCredential } from '../blueskyCredential/blueskyCredential.ts';
import type { BlueskySession } from '../blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../instant/instant.ts';
import { BlueskyAccountSwitchId } from './blueskyAccountSwitchId.ts';

export const BLUESKY_ACCOUNT_SWITCH_PURGE_DELAY_MS = 90 * 1000;
export const BLUESKY_ACCOUNT_SWITCH_STALLED_ATTEMPTS = 30;
export const BLUESKY_ACCOUNT_SWITCH_PURGE_BATCH_SIZE = 500;
export const BLUESKY_ACCOUNT_SWITCH_PURGE_TIME_BUDGET_MS = 20 * 1000;
const MAX_LAST_ERROR_LENGTH = 200;

export const BLUESKY_ACCOUNT_SWITCH_PURGE_TARGETS = [
  'syncStatus',
  'crossposts',
  'timelineItems',
  'likes',
  'reposts',
  'bookmarks',
  'moderatedActors',
  'notificationReceipts',
  'notificationSyncState',
  'chatPushReceipts',
  'notifications',
] as const;
export type BlueskyAccountSwitchPurgeTarget = (typeof BLUESKY_ACCOUNT_SWITCH_PURGE_TARGETS)[number];

const count = z.number().int().nonnegative();
const deletedCountsZodType = z.object({
  syncStatus: count,
  crossposts: count,
  timelineItems: count,
  likes: count,
  reposts: count,
  bookmarks: count,
  moderatedActors: count,
  notificationReceipts: count,
  notificationSyncState: count,
  chatPushReceipts: count.default(0),
  notifications: count,
});
export type BlueskyAccountSwitchDeletedCounts = z.output<typeof deletedCountsZodType>;
export const BlueskyAccountSwitchDeletedCounts = Schema.create<
  BlueskyAccountSwitchDeletedCounts,
  z.input<typeof deletedCountsZodType>
>(deletedCountsZodType);

const emptyCounts: BlueskyAccountSwitchDeletedCounts = {
  syncStatus: 0,
  crossposts: 0,
  timelineItems: 0,
  likes: 0,
  reposts: 0,
  bookmarks: 0,
  moderatedActors: 0,
  notificationReceipts: 0,
  notificationSyncState: 0,
  chatPushReceipts: 0,
  notifications: 0,
};

const zodType = z.object({
  switchId: BlueskyAccountSwitchId.zodType,
  fromDid: z.string().min(1),
  toDid: z.string().min(1),
  startedAt: Instant.zodType,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  deletedCounts: deletedCountsZodType,
  updatedAt: Instant.zodType,
}).describe('BlueskyAccountSwitch');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);

export type BlueskyAccountSwitch = z.output<typeof zodType>;
export type BlueskyAccountSwitchAggregate = Agg.Aggregate<
  BlueskyAccountSwitchId,
  'blueskyAccountSwitch',
  BlueskyAccountSwitch
>;
type BlueskyAccountSwitchEvent<
  TAggregateState extends Agg.InferState<BlueskyAccountSwitchAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<BlueskyAccountSwitchAggregate, TAggregateState, TEventName, TEventPayload>;

const BlueskyAccountSwitchEvent = AggregateEvent.createFactory<BlueskyAccountSwitchAggregate>('blueskyAccountSwitch');

export type BlueskyAccountSwitchStarted = BlueskyAccountSwitchEvent<
  BlueskyAccountSwitch,
  'blueskyAccountSwitch.started',
  Readonly<{ fromDid: string; toDid: string; startedAt: Instant }>
>;
export type BlueskyAccountSwitchCompleted = BlueskyAccountSwitchEvent<
  undefined,
  'blueskyAccountSwitch.completed',
  Readonly<{
    fromDid: string;
    toDid: string;
    startedAt: Instant;
    deletedCounts: BlueskyAccountSwitchDeletedCounts;
  }>
>;

export type BlueskyAccountSwitchSameAccountError = Readonly<{
  type: 'BlueskyAccountSwitchSameAccountError';
  message: string;
}>;

export type BlueskyAccountSwitchInProgress = Readonly<{
  type: 'BlueskyAccountSwitchInProgress';
  message: string;
}>;

export const BlueskyAccountSwitchInProgress = {
  create: (): BlueskyAccountSwitchInProgress => ({
    type: 'BlueskyAccountSwitchInProgress',
    message: 'The previous Bluesky account switch has not finished.',
  }),
} as const;

export type BlueskyDidChanged = Readonly<{
  type: 'BlueskyDidChanged';
  message: string;
}>;

export const BlueskyDidChanged = {
  create: (): BlueskyDidChanged => ({
    type: 'BlueskyDidChanged',
    message: 'The connected account or the account to switch to has changed.',
  }),
} as const;

export type BlueskyAccountSwitchResolver = Readonly<{
  resolve: () => RA<BlueskyAccountSwitch | undefined, never>;
}>;
export type BlueskyAccountSwitchStartedStore = Readonly<{
  store: (
    started: Readonly<{
      event: BlueskyAccountSwitchStarted;
      credential: BlueskyStoredCredential;
      session: BlueskySession;
    }>,
  ) => RA<void, BlueskyAccountSwitchInProgress | BlueskyDidChanged>;
}>;
export type BlueskyAccountSwitchPurger = Readonly<{
  purge: (target: BlueskyAccountSwitchPurgeTarget, startedAt: Instant) => RA<number, never>;
}>;
export type BlueskyAccountSwitchProgressStore = Readonly<{
  record: (
    switchId: BlueskyAccountSwitchId,
    target: BlueskyAccountSwitchPurgeTarget,
    deleted: number,
    at: Instant,
  ) => RA<void, never>;
}>;
export type BlueskyAccountSwitchFailedStore = Readonly<{
  store: (failed: BlueskyAccountSwitch) => RA<void, never>;
}>;
export type BlueskyAccountSwitchCompletedStore = Readonly<{
  store: (event: BlueskyAccountSwitchCompleted, switchId: BlueskyAccountSwitchId) => RA<void, never>;
}>;

export type BlueskyAccountSwitchPreview = Readonly<{
  timelineItems: number;
  notifications: number;
  likes: number;
  reposts: number;
  bookmarks: number;
  moderatedActors: number;
  crossposts: number;
}>;
export type BlueskyAccountSwitchPreviewResolver = Readonly<{
  resolve: () => RA<BlueskyAccountSwitchPreview, never>;
}>;

export type BlueskyAccountSwitchView =
  | Readonly<{ state: 'idle' }>
  | Readonly<{
    state: 'purging';
    fromDid: string;
    toDid: string;
    startedAt: Instant;
    attempts: number;
    lastError: string | null;
    stalled: boolean;
  }>;

const start = (now: Instant) =>
(
  props: Readonly<{ fromDid: string; toDid: string }>,
): Result<BlueskyAccountSwitchStarted, BlueskyAccountSwitchSameAccountError> => {
  if (props.fromDid === props.toDid) {
    return Result.err({
      type: 'BlueskyAccountSwitchSameAccountError',
      message: 'The switch target is the account that is already connected.',
    });
  }
  const state: BlueskyAccountSwitch = {
    switchId: BlueskyAccountSwitchId.generate(),
    fromDid: props.fromDid,
    toDid: props.toDid,
    startedAt: now,
    attempts: 0,
    lastError: null,
    deletedCounts: emptyCounts,
    updatedAt: now,
  };
  return Result.ok(
    BlueskyAccountSwitchEvent.create(
      state.switchId,
      state,
      'blueskyAccountSwitch.started',
      { fromDid: state.fromDid, toDid: state.toDid, startedAt: now },
      now,
    ),
  );
};

const complete = (now: Instant) => (state: BlueskyAccountSwitch): BlueskyAccountSwitchCompleted =>
  BlueskyAccountSwitchEvent.create(
    state.switchId,
    undefined,
    'blueskyAccountSwitch.completed',
    {
      fromDid: state.fromDid,
      toDid: state.toDid,
      startedAt: state.startedAt,
      deletedCounts: state.deletedCounts,
    },
    now,
  );

const recordDeleted = (
  state: BlueskyAccountSwitch,
  target: BlueskyAccountSwitchPurgeTarget,
  deleted: number,
  now: Instant,
): BlueskyAccountSwitch => ({
  ...state,
  deletedCounts: { ...state.deletedCounts, [target]: state.deletedCounts[target] + deleted },
  updatedAt: now,
});

const fail = (state: BlueskyAccountSwitch, lastError: string, now: Instant): BlueskyAccountSwitch => ({
  ...state,
  attempts: state.attempts + 1,
  lastError: lastError.slice(0, MAX_LAST_ERROR_LENGTH),
  updatedAt: now,
});

const isStalled = (state: BlueskyAccountSwitch): boolean => state.attempts > BLUESKY_ACCOUNT_SWITCH_STALLED_ATTEMPTS;

const isPurgeable = (state: BlueskyAccountSwitch, now: Instant): boolean =>
  now - state.startedAt >= BLUESKY_ACCOUNT_SWITCH_PURGE_DELAY_MS;

const toView = (state: BlueskyAccountSwitch | undefined): BlueskyAccountSwitchView =>
  state === undefined ? { state: 'idle' } : {
    state: 'purging',
    fromDid: state.fromDid,
    toDid: state.toDid,
    startedAt: state.startedAt,
    attempts: state.attempts,
    lastError: state.lastError,
    stalled: isStalled(state),
  };

export const BlueskyAccountSwitch = {
  ...schema,
  start,
  complete,
  recordDeleted,
  fail,
  isStalled,
  isPurgeable,
  toView,
  emptyCounts,
} as const;
