import { Instant } from '../../../domain/instant/instant.ts';
import type { InterestSource, InterestSourceKind } from '../../../domain/interestSource/interestSource.ts';
import { InterestSourceId } from '../../../domain/interestSource/interestSourceId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { interestSourcesTable } from '../schema.ts';

export const interestSourceSelection = {
  interestSourceId: interestSourcesTable.interestSourceId,
  userId: interestSourcesTable.userId,
  kind: interestSourcesTable.kind,
  ref: interestSourcesTable.ref,
  contentHash: interestSourcesTable.contentHash,
  weight: interestSourcesTable.weight,
  occurredAt: interestSourcesTable.occurredAt,
  embeddedAt: interestSourcesTable.embeddedAt,
  deletedAt: interestSourcesTable.deletedAt,
  createdAt: interestSourcesTable.createdAt,
  updatedAt: interestSourcesTable.updatedAt,
} as const;

type InterestSourceRow = Omit<typeof interestSourcesTable.$inferSelect, 'embedding'>;

const toInstantOrNull = (value: Date | null): Instant | null =>
  value === null ? null : Instant.orThrow(value.getTime());

export const reconstructInterestSource = (row: InterestSourceRow): InterestSource => ({
  interestSourceId: InterestSourceId.orThrow(row.interestSourceId),
  userId: UserId.orThrow(row.userId),
  kind: row.kind as InterestSourceKind,
  ref: row.ref,
  contentHash: row.contentHash,
  weight: row.weight,
  occurredAt: Instant.orThrow(row.occurredAt.getTime()),
  embeddedAt: toInstantOrNull(row.embeddedAt),
  deletedAt: toInstantOrNull(row.deletedAt),
  createdAt: Instant.orThrow(row.createdAt.getTime()),
  updatedAt: Instant.orThrow(row.updatedAt.getTime()),
});
