import type { ActorId } from '../../domain/actor/actorId.ts';

/** One D1 text binding, bounded by D1's 2,000,000-byte value limit. */
export const actorIdsJson = (actorIds: readonly ActorId[]): string => {
  const json = JSON.stringify(actorIds);
  if (new TextEncoder().encode(json).byteLength > 2_000_000) {
    // Resolver ports propagate infrastructure failures; never truncate the selection.
    throw new Error('D1 actor selection exceeds the text value limit.');
  }
  return json;
};
