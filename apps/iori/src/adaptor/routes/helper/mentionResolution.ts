import { getLogger } from '@logtape/logtape';

import {
  extractMentionAccts,
  type MentionFormat,
  MentionRecipient,
  type ResolvedMentions,
} from '../../../domain/post/mention.ts';
import type { Username } from '../../../domain/user/username.ts';
import type { RemoteActorLookup } from '../../fedify/remoteActorLookup.ts';

export type MentionResolution = Readonly<{
  links: ResolvedMentions;
  recipients: ReadonlyArray<MentionRecipient>;
}>;

const MENTION_LOOKUP_TIMEOUT_MS = 5000;

export const noMentions: MentionResolution = { links: new Map(), recipients: [] };

type ResolveParams = Readonly<{
  lookup: RemoteActorLookup;
  text: string;
  format: MentionFormat;
  identifier: Username;
  request: Request;
}>;

const resolveAcct = async (
  { lookup, identifier, request }: Omit<ResolveParams, 'text' | 'format'>,
  acct: string,
): Promise<Readonly<{ acct: string; recipient: MentionRecipient }> | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<'timedOut'>((resolve) => {
      timer = setTimeout(() => resolve('timedOut'), MENTION_LOOKUP_TIMEOUT_MS);
    });
    const result = await Promise.race([lookup.lookup({ request, handle: `@${acct}`, identifier }), timeout]);
    if (result === 'timedOut') {
      getLogger().warn(`Timed out resolving the mentioned actor ${acct}`);
      return undefined;
    }
    if (!result.ok || result.val.id === null || result.val.inboxId === null) {
      return undefined;
    }
    const actor = result.val;
    const recipient = MentionRecipient.parse({
      id: actor.id?.href,
      inboxUrl: actor.inboxId?.href,
      sharedInboxUrl: actor.endpoints?.sharedInbox?.href,
    });
    return recipient.ok ? { acct, recipient: recipient.val } : undefined;
  } catch (err) {
    getLogger().warn(`Failed to resolve the mentioned actor ${acct}: ${err}`);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};

export const resolveMentions = async ({ text, format, ...rest }: ResolveParams): Promise<MentionResolution> => {
  const ownHost = new URL(rest.request.url).host.toLowerCase();
  const accts = extractMentionAccts(text, format).filter((acct) => acct.slice(acct.lastIndexOf('@') + 1) !== ownHost);
  const resolved = await Promise.all(accts.map((acct) => resolveAcct(rest, acct)));
  const found = resolved.filter((entry) => entry !== undefined);
  return {
    links: new Map(found.map(({ acct, recipient }) => [acct, recipient.id])),
    recipients: found.map(({ recipient }) => recipient),
  };
};
