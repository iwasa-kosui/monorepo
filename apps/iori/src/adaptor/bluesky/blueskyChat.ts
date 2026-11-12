import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type {
  BlueskyChatConvo,
  BlueskyChatConvoStatus,
  BlueskyChatMember,
  BlueskyChatMessage,
  BlueskyChatSharedPost,
} from '../../domain/blueskyChat/blueskyChat.ts';
import type { BlueskyChat } from '../../ports/blueskyChat.ts';
import type { BlueskyChatClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import { facetOf, httpUrlOrNull } from './blueskyPostView.ts';

const MESSAGE_VIEW = 'chat.bsky.convo.defs#messageView';
const DELETED_MESSAGE_VIEW = 'chat.bsky.convo.defs#deletedMessageView';
const RECORD_VIEW = 'app.bsky.embed.record#view';
const VIEW_RECORD = 'app.bsky.embed.record#viewRecord';

const memberZodType = z.looseObject({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
  chatDisabled: z.boolean().optional(),
});
const messageViewZodType = z.looseObject({
  $type: z.literal(MESSAGE_VIEW).optional(),
  id: z.string().min(1),
  text: z.string(),
  facets: z.array(z.unknown()).optional(),
  embed: z.unknown().optional(),
  reactions: z.array(z.unknown()).optional(),
  sender: z.looseObject({ did: z.string().min(1) }),
  sentAt: z.string(),
});
const reactionViewZodType = z.looseObject({
  value: z.string().min(1),
  sender: z.looseObject({ did: z.string().min(1) }),
});
const sharedPostEmbedZodType = z.looseObject({
  $type: z.literal(RECORD_VIEW),
  record: z.looseObject({
    $type: z.literal(VIEW_RECORD),
    uri: z.string().min(1),
    author: z.looseObject({ handle: z.string().min(1), displayName: z.string().optional() }),
    value: z.looseObject({ text: z.string().optional() }),
  }),
});
const deletedMessageViewZodType = z.looseObject({
  $type: z.literal(DELETED_MESSAGE_VIEW),
  id: z.string().min(1),
  sender: z.looseObject({ did: z.string().min(1) }),
  sentAt: z.string(),
});
const unknownMessageZodType = z.looseObject({ id: z.string().optional(), sentAt: z.string().optional() });
const convoZodType = z.looseObject({
  id: z.string().min(1),
  rev: z.string(),
  members: z.array(z.unknown()),
  lastMessage: z.unknown().optional(),
  muted: z.boolean().default(false),
  status: z.string().optional(),
  unreadCount: z.number().int().nonnegative().default(0),
});
const convoResponseZodType = z.object({ convo: z.unknown() });
const convosPageZodType = z.object({ cursor: z.string().optional(), convos: z.array(z.unknown()) });
const messagesPageZodType = z.object({ cursor: z.string().optional(), messages: z.array(z.unknown()) });

const invalid = (operation: string): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'invalid_response',
  message: `${operation} returned an unexpected response`,
});

const instantOf = (text: string): number | undefined => {
  const at = Date.parse(text);
  return Number.isNaN(at) ? undefined : at;
};

const sharedPostOf = (embed: unknown): BlueskyChatSharedPost | null => {
  const parsed = sharedPostEmbedZodType.safeParse(embed);
  if (!parsed.success) return null;
  const { uri, author, value } = parsed.data.record;
  return {
    uri,
    authorHandle: author.handle,
    authorDisplayName: author.displayName === undefined || author.displayName === '' ? null : author.displayName,
    text: value.text ?? '',
  };
};

const messageOf = (raw: unknown): BlueskyChatMessage | undefined => {
  const message = messageViewZodType.safeParse(raw);
  if (message.success) {
    const sentAt = instantOf(message.data.sentAt);
    if (sentAt !== undefined) {
      return {
        kind: 'message',
        id: message.data.id,
        text: message.data.text,
        facets: (message.data.facets ?? []).flatMap((facet) => facetOf(facet) ?? []),
        hasEmbed: message.data.embed !== undefined && message.data.embed !== null,
        sharedPost: sharedPostOf(message.data.embed),
        reactions: (message.data.reactions ?? []).flatMap((reaction) => {
          const parsed = reactionViewZodType.safeParse(reaction);
          return parsed.success ? [{ value: parsed.data.value, senderDid: parsed.data.sender.did }] : [];
        }),
        senderDid: message.data.sender.did,
        sentAt,
      };
    }
  }
  const deleted = deletedMessageViewZodType.safeParse(raw);
  if (deleted.success) {
    const sentAt = instantOf(deleted.data.sentAt);
    if (sentAt !== undefined) {
      return { kind: 'deleted', id: deleted.data.id, senderDid: deleted.data.sender.did, sentAt };
    }
  }
  const unknown = unknownMessageZodType.safeParse(raw);
  if (!unknown.success) return undefined;
  return {
    kind: 'unsupported',
    id: unknown.data.id ?? null,
    sentAt: unknown.data.sentAt === undefined ? null : instantOf(unknown.data.sentAt) ?? null,
  };
};

const memberOf = (raw: unknown): BlueskyChatMember | undefined => {
  const parsed = memberZodType.safeParse(raw);
  if (!parsed.success) return undefined;
  const { did, handle, displayName, avatar, chatDisabled } = parsed.data;
  return {
    did,
    handle,
    displayName: displayName === undefined || displayName === '' ? null : displayName,
    avatar: httpUrlOrNull(avatar),
    chatDisabled: chatDisabled === true,
  };
};

const statusOf = (status: string | undefined): BlueskyChatConvoStatus =>
  status === undefined || status === 'accepted' ? 'accepted' : status === 'request' ? 'request' : 'unknown';

const convoOf = (raw: unknown): BlueskyChatConvo | undefined => {
  const parsed = convoZodType.safeParse(raw);
  if (!parsed.success) return undefined;
  const { id, rev, members, lastMessage, muted, status, unreadCount } = parsed.data;
  return {
    id,
    rev,
    members: members.flatMap((member) => memberOf(member) ?? []),
    lastMessage: lastMessage === undefined || lastMessage === null ? null : messageOf(lastMessage) ?? null,
    muted,
    status: statusOf(status),
    unreadCount,
  };
};

const toConvo = (operation: string, response: Readonly<Record<string, unknown>>) => {
  const parsed = convoResponseZodType.safeParse(response);
  const convo = parsed.success ? convoOf(parsed.data.convo) : undefined;
  return convo === undefined ? RA.err(invalid(operation)) : RA.ok(convo);
};

const withCursor = (cursor: string | undefined): Record<string, string> =>
  cursor === undefined || cursor === '' ? {} : { cursor };

export const createBlueskyChat = (deps: Readonly<{ client: BlueskyChatClient }>): BlueskyChat => {
  const { client } = deps;
  return {
    viewerDid: client.viewerDid,
    listConvos: async ({ limit, cursor }) => {
      const response = await client.chatQuery('chat.bsky.convo.listConvos', {
        limit: String(limit),
        ...withCursor(cursor),
      });
      if (!response.ok) return response;
      const page = convosPageZodType.safeParse(response.val);
      return page.success
        ? RA.ok({ items: page.data.convos.flatMap((convo) => convoOf(convo) ?? []), cursor: page.data.cursor })
        : RA.err(invalid('listConvos'));
    },
    getConvo: async (convoId) => {
      const response = await client.chatQuery('chat.bsky.convo.getConvo', { convoId });
      return response.ok ? toConvo('getConvo', response.val) : response;
    },
    getConvoForMember: async (did) => {
      const response = await client.chatQuery('chat.bsky.convo.getConvoForMembers', { members: [did] });
      return response.ok ? toConvo('getConvoForMembers', response.val) : response;
    },
    getMessages: async ({ convoId, limit, cursor }) => {
      const response = await client.chatQuery('chat.bsky.convo.getMessages', {
        convoId,
        limit: String(limit),
        ...withCursor(cursor),
      });
      if (!response.ok) return response;
      const page = messagesPageZodType.safeParse(response.val);
      return page.success
        ? RA.ok({ items: page.data.messages.flatMap((message) => messageOf(message) ?? []), cursor: page.data.cursor })
        : RA.err(invalid('getMessages'));
    },
    sendMessage: async ({ convoId, text }) => {
      const response = await client.chatProcedure('chat.bsky.convo.sendMessage', { convoId, message: { text } });
      if (!response.ok) return response;
      const message = messageOf(response.val);
      return message?.kind === 'message' ? RA.ok(message) : RA.err(invalid('sendMessage'));
    },
    updateRead: async ({ convoId, messageId }) => {
      const response = await client.chatProcedure('chat.bsky.convo.updateRead', {
        convoId,
        ...(messageId === undefined ? {} : { messageId }),
      });
      return response.ok ? toConvo('updateRead', response.val) : response;
    },
    acceptConvo: async (convoId) => {
      const response = await client.chatProcedure('chat.bsky.convo.acceptConvo', { convoId });
      return response.ok ? RA.ok(undefined) : response;
    },
  };
};
