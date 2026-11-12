import type { RequestContext } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import { getLogger } from '@logtape/logtape';

import type { MentionRecipient } from '../../domain/post/mention.ts';
import type { Visibility } from '../../domain/post/visibility.ts';

type Params = Readonly<{
  ctx: RequestContext<unknown>;
  identifier: string;
  activity: Activity;
  mentions: ReadonlyArray<MentionRecipient>;
  excludedActorIds?: ReadonlyArray<string>;
  visibility?: Visibility;
}>;

const toRecipients = (
  mentions: ReadonlyArray<MentionRecipient>,
  excludedActorIds: ReadonlyArray<string>,
  ownOrigin: string,
): Recipient[] => {
  const seen = new Set(excludedActorIds);
  const recipients: Recipient[] = [];
  for (const mention of mentions) {
    if (seen.has(mention.id) || new URL(mention.id).origin === ownOrigin) {
      continue;
    }
    seen.add(mention.id);
    recipients.push({
      id: new URL(mention.id),
      inboxId: new URL(mention.inboxUrl),
      endpoints: mention.sharedInboxUrl === undefined ? null : { sharedInbox: new URL(mention.sharedInboxUrl) },
    });
  }
  return recipients;
};

export const sendToMentions = async ({
  ctx,
  identifier,
  activity,
  mentions,
  excludedActorIds = [],
  visibility,
}: Params): Promise<void> => {
  const recipients = toRecipients(mentions, excludedActorIds, ctx.getActorUri(identifier).origin);
  if (recipients.length === 0) {
    return;
  }
  try {
    await ctx.sendActivity({ identifier }, recipients, activity, { preferSharedInbox: visibility !== 'direct' });
    getLogger().info(`Sent post to mentioned actors: ${recipients.length}`);
  } catch (err) {
    getLogger().warn(`Failed to send post to mentioned actors: ${err}`);
  }
};
