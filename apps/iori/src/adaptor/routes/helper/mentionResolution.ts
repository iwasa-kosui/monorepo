import { getLogger } from '@logtape/logtape';

import {
  extractMentionAccts,
  MENTION_LOOKUP_TIMEOUT_MS,
  type MentionFormat,
  MentionRecipient,
  type ResolvedMentions,
} from '../../../domain/post/mention.ts';
import type { Username } from '../../../domain/user/username.ts';
import { timedOut, withTimeout } from '../../../helper/withTimeout.ts';
import type { RemoteActorLookup } from '../../fedify/remoteActorLookup.ts';

export type MentionResolution = Readonly<{
  links: ResolvedMentions;
  recipients: ReadonlyArray<MentionRecipient>;
}>;

export const noMentions: MentionResolution = { links: new Map(), recipients: [] };

export type LocalMentionRecipientResolver = (username: string) => Promise<MentionRecipient | undefined>;

type ResolveParams = Readonly<{
  lookup: RemoteActorLookup;
  localRecipient: LocalMentionRecipientResolver;
  text: string;
  format: MentionFormat;
  identifier: Username;
  request: Request;
}>;

const resolveAcct = async (
  { lookup, identifier, request }: Pick<ResolveParams, 'lookup' | 'identifier' | 'request'>,
  acct: string,
): Promise<Readonly<{ acct: string; recipient: MentionRecipient }> | undefined> => {
  try {
    const result = await withTimeout(
      lookup.lookup({ request, handle: `@${acct}`, identifier }),
      MENTION_LOOKUP_TIMEOUT_MS,
    );
    if (result === timedOut) {
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
  }
};

const resolveLocalAcct = async (
  localRecipient: LocalMentionRecipientResolver,
  acct: string,
): Promise<Readonly<{ acct: string; recipient: MentionRecipient }> | undefined> => {
  try {
    const recipient = await localRecipient(acct.slice(0, acct.lastIndexOf('@')));
    return recipient === undefined ? undefined : { acct, recipient };
  } catch (err) {
    getLogger().warn(`Failed to resolve the mentioned local actor ${acct}: ${err}`);
    return undefined;
  }
};

/**
 * 本文の acct を解決する。自分のホストの acct は外へ問い合わせず、ローカルの利用者から解決する。
 */
export const resolveMentions = async (
  { text, format, localRecipient, ...rest }: ResolveParams,
): Promise<MentionResolution> => {
  const ownHost = new URL(rest.request.url).host.toLowerCase();
  const resolved = await Promise.all(
    extractMentionAccts(text, format).map((acct) =>
      acct.slice(acct.lastIndexOf('@') + 1) === ownHost
        ? resolveLocalAcct(localRecipient, acct)
        : resolveAcct(rest, acct)
    ),
  );
  const found = resolved.filter((entry) => entry !== undefined);
  return {
    links: new Map(found.map(({ acct, recipient }) => [acct, recipient.id])),
    recipients: found.map(({ recipient }) => recipient),
  };
};
