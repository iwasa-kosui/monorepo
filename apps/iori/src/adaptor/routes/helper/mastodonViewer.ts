import type { ActorResolverByUserId } from '../../../domain/actor/actor.ts';
import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { MastodonPrincipal } from '../mastodonAuthn.ts';

export type ViewerLookup = Readonly<{ ok: true; viewerActorId: ActorId | undefined }> | Readonly<{ ok: false }>;

export const resolveViewer = async (
  actorResolverByUserId: ActorResolverByUserId,
  principal: MastodonPrincipal | undefined,
): Promise<ViewerLookup> => {
  if (principal?.userId === null || principal?.userId === undefined) {
    return { ok: true, viewerActorId: undefined };
  }
  const actor = await actorResolverByUserId.resolve(principal.userId);
  return actor.ok ? { ok: true, viewerActorId: actor.val?.id } : { ok: false };
};
