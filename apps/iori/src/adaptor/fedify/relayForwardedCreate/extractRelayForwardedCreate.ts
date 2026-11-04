import type { InboxRequestReport } from '@fedify/fedify';
import { Create } from '@fedify/vocab';

export type RelayForwardedCreate = Readonly<{
  objectId: URL;
  actorId: URL;
  keyOwnerId: URL;
}>;

export const extractRelayForwardedCreate = (report: InboxRequestReport): RelayForwardedCreate | undefined => {
  const { authentication, outcome, activity } = report;
  if (authentication.status !== 'rejected' || authentication.reason.type !== 'actorKeyMismatch') {
    return undefined;
  }
  const { key } = authentication.reason;
  if (key.type !== 'cryptographicKey' || !key.ownerId) {
    return undefined;
  }
  if (outcome.type !== 'response' || outcome.status !== 401) {
    return undefined;
  }
  if (!(activity instanceof Create)) {
    return undefined;
  }
  const { objectId, actorId } = activity;
  if (!objectId || !actorId || objectId.origin !== actorId.origin) {
    return undefined;
  }
  return { objectId, actorId, keyOwnerId: key.ownerId };
};
