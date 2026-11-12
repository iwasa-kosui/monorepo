import type { ActorId } from '../../domain/actor/actorId.ts';
import type { BlockResolver } from '../../domain/block/block.ts';
import type { UserId } from '../../domain/user/userId.ts';

export const isBlockedBy = async (
  blockResolver: BlockResolver | undefined,
  userId: UserId,
  actorId: ActorId,
): Promise<boolean> => {
  if (blockResolver === undefined) return false;
  const block = await blockResolver.resolve({ userId, blockedActorId: actorId });
  return block.ok && block.val !== undefined;
};
