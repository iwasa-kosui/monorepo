import type { Instant } from '../instant/instant.ts';
import type { InterestSource } from './interestSource.ts';

export type DesiredInterestSource = Readonly<{
  ref: string;
  contentHash: string;
  occurredAt: Instant;
}>;

export type InterestSourceDiff = Readonly<{
  created: ReadonlyArray<DesiredInterestSource>;
  changed: ReadonlyArray<Readonly<{ source: InterestSource; desired: DesiredInterestSource }>>;
  deleted: ReadonlyArray<InterestSource>;
}>;

const compute = (
  existing: ReadonlyArray<InterestSource>,
  desired: ReadonlyArray<DesiredInterestSource>,
): InterestSourceDiff => {
  const existingByRef = new Map(existing.map((source) => [source.ref, source]));
  const desiredByRef = new Map<string, DesiredInterestSource>();
  for (const item of desired) {
    if (!desiredByRef.has(item.ref)) desiredByRef.set(item.ref, item);
  }
  const created: DesiredInterestSource[] = [];
  const changed: { source: InterestSource; desired: DesiredInterestSource }[] = [];
  for (const item of desiredByRef.values()) {
    const source = existingByRef.get(item.ref);
    if (source === undefined) created.push(item);
    else if (source.deletedAt !== null || source.contentHash !== item.contentHash) {
      changed.push({ source, desired: item });
    }
  }
  const deleted = existing.filter((source) => source.deletedAt === null && !desiredByRef.has(source.ref));
  return { created, changed, deleted };
};

export const InterestSourceDiff = { compute } as const;
