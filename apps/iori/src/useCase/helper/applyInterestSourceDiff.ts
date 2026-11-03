import { RA } from '@iwasa-kosui/result';

import type { Instant } from '../../domain/instant/instant.ts';
import {
  InterestSource,
  type InterestSourceContentChanged,
  type InterestSourceContentChangedStore,
  type InterestSourceCreated,
  type InterestSourceCreatedStore,
  type InterestSourceDeletedStore,
  type InterestSourceKind,
  type InterestSourceParseError,
} from '../../domain/interestSource/interestSource.ts';
import type { InterestSourceDiff } from '../../domain/interestSource/interestSourceDiff.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { chunk } from '../../helper/chunk.ts';

const EVENTS_PER_STORE = 100;

type Deps = Readonly<{
  interestSourceCreatedStore: InterestSourceCreatedStore;
  interestSourceContentChangedStore: InterestSourceContentChangedStore;
  interestSourceDeletedStore: InterestSourceDeletedStore;
  now: () => Instant;
}>;

export type AppliedInterestSourceDiff = Readonly<{
  created: ReadonlyArray<InterestSource>;
  changed: ReadonlyArray<InterestSource>;
  deleted: number;
}>;

export const applyInterestSourceDiff = async (
  { interestSourceCreatedStore, interestSourceContentChangedStore, interestSourceDeletedStore, now }: Deps,
  { userId, kind }: Readonly<{ userId: UserId; kind: InterestSourceKind }>,
  diff: InterestSourceDiff,
): RA<AppliedInterestSourceDiff, InterestSourceParseError> => {
  const timestamp = now();
  const createdEvents: InterestSourceCreated[] = [];
  for (const { ref, contentHash, occurredAt } of diff.created) {
    const created = InterestSource.create({ userId, kind, ref, contentHash, occurredAt }, timestamp);
    if (!created.ok) return created;
    createdEvents.push(created.val);
  }
  const changedEvents: InterestSourceContentChanged[] = [];
  for (const { source, desired } of diff.changed) {
    const changed = InterestSource.changeContent(
      source,
      { contentHash: desired.contentHash, occurredAt: desired.occurredAt },
      timestamp,
    );
    if (!changed.ok) return changed;
    changedEvents.push(changed.val);
  }
  const deletedEvents = diff.deleted.map((source) => InterestSource.markDeleted(source, timestamp));

  for (const events of chunk(createdEvents, EVENTS_PER_STORE)) await interestSourceCreatedStore.store(...events);
  for (const events of chunk(changedEvents, EVENTS_PER_STORE)) await interestSourceContentChangedStore.store(...events);
  for (const events of chunk(deletedEvents, EVENTS_PER_STORE)) await interestSourceDeletedStore.store(...events);

  return RA.ok({
    created: createdEvents.map((event) => event.aggregateState),
    changed: changedEvents.map((event) => event.aggregateState),
    deleted: deletedEvents.length,
  });
};
