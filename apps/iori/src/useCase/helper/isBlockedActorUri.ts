import type { BlockedActorUriResolverByUsername } from '../../domain/block/block.ts';
import type { Username } from '../../domain/user/username.ts';

const MAX_MESSAGE_LENGTH = 200;

export const isBlockedActorUri = async (
  resolver: BlockedActorUriResolverByUsername,
  username: Username,
  actorUri: string,
): Promise<boolean> => {
  try {
    const blocked = await resolver.resolve({ username, actorUri });
    return !blocked.ok || blocked.val;
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message.slice(0, MAX_MESSAGE_LENGTH) : '';
    console.warn(`blocked actor check failed; treating as blocked: ${name}: ${message}`);
    return true;
  }
};
