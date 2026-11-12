import { RA } from '@iwasa-kosui/result';

import { byteLengthOf, graphemesOf } from '../adaptor/bluesky/blueskyPostRecord.ts';
import {
  BLUESKY_CHAT_MAX_GRAPHEMES,
  BLUESKY_CHAT_MAX_TEXT_BYTES,
  BLUESKY_CHAT_PAGE_LIMIT,
  type BlueskyChatConvo,
  type BlueskyChatConvoStatus,
  type BlueskyChatMember,
  type BlueskyChatMessage,
  type BlueskyChatMessageInvalid,
  type BlueskyChatTextMessage,
} from '../domain/blueskyChat/blueskyChat.ts';
import type { BlueskyChat } from '../ports/blueskyChat.ts';
import type { BlueskyClientError, BlueskyQueryClient } from '../ports/blueskyClient.ts';
import { buildFacets } from './helper/publishBlueskyPost.ts';
import type { UseCase } from './useCase.ts';

const CONVOS_LIMIT = 50;
const MESSAGES_LIMIT = 50;

export type BlueskyChatMessagePreview = Readonly<{
  kind: BlueskyChatMessage['kind'];
  text: string | null;
  senderDid: string | null;
  sentAt: number | null;
}>;

export type BlueskyChatConvoSummary = Readonly<{
  id: string;
  rev: string;
  peers: readonly BlueskyChatMember[];
  lastMessage: BlueskyChatMessagePreview | null;
  muted: boolean;
  status: BlueskyChatConvoStatus;
  unreadCount: number;
}>;

export type BlueskyChatConvosPage = Readonly<{ convos: readonly BlueskyChatConvoSummary[]; cursor: string | null }>;

export type BlueskyChatMessagesPage = Readonly<{
  messages: readonly BlueskyChatMessage[];
  cursor: string | null;
  order: 'oldest_first';
}>;

export type BlueskyChatUnreadCount = Readonly<{ unread: number; requests: number }>;

export type ListBlueskyChatConvosUseCase = UseCase<
  Readonly<{ cursor?: string | undefined }>,
  BlueskyChatConvosPage,
  BlueskyClientError
>;
export type GetBlueskyChatConvoUseCase = UseCase<
  Readonly<{ convoId: string }>,
  BlueskyChatConvoSummary,
  BlueskyClientError
>;
export type ListBlueskyChatMessagesUseCase = UseCase<
  Readonly<{ convoId: string; cursor?: string | undefined }>,
  BlueskyChatMessagesPage,
  BlueskyClientError
>;
export type SendBlueskyChatMessageUseCase = UseCase<
  Readonly<{ convoId: string; text: string }>,
  BlueskyChatTextMessage,
  BlueskyClientError | BlueskyChatMessageInvalid
>;
export type MarkBlueskyChatConvoReadUseCase = UseCase<
  Readonly<{ convoId: string; messageId?: string | undefined }>,
  BlueskyChatConvoSummary,
  BlueskyClientError
>;
export type AcceptBlueskyChatConvoUseCase = UseCase<Readonly<{ convoId: string }>, void, BlueskyClientError>;
export type OpenBlueskyChatConvoUseCase = UseCase<
  Readonly<{ did: string }>,
  BlueskyChatConvoSummary,
  BlueskyClientError
>;
export type GetBlueskyChatUnreadCountUseCase = UseCase<void, BlueskyChatUnreadCount, BlueskyClientError>;

export type BlueskyChatUseCases = Readonly<{
  listConvos: ListBlueskyChatConvosUseCase;
  getConvo: GetBlueskyChatConvoUseCase;
  listMessages: ListBlueskyChatMessagesUseCase;
  sendMessage: SendBlueskyChatMessageUseCase;
  markRead: MarkBlueskyChatConvoReadUseCase;
  acceptConvo: AcceptBlueskyChatConvoUseCase;
  openConvo: OpenBlueskyChatConvoUseCase;
  unreadCount: GetBlueskyChatUnreadCountUseCase;
}>;

type Deps = Readonly<{ chat: BlueskyChat; query: BlueskyQueryClient['query'] }>;

const previewOf = (message: BlueskyChatMessage | null): BlueskyChatMessagePreview | null => {
  if (message === null) return null;
  if (message.kind === 'message') {
    return { kind: 'message', text: message.text, senderDid: message.senderDid, sentAt: message.sentAt };
  }
  if (message.kind === 'deleted') {
    return { kind: 'deleted', text: null, senderDid: message.senderDid, sentAt: message.sentAt };
  }
  return { kind: 'unsupported', text: null, senderDid: null, sentAt: message.sentAt };
};

const summaryOf = (convo: BlueskyChatConvo, viewerDid: string): BlueskyChatConvoSummary => ({
  id: convo.id,
  rev: convo.rev,
  peers: convo.members.filter((member) => member.did !== viewerDid),
  lastMessage: previewOf(convo.lastMessage),
  muted: convo.muted,
  status: convo.status,
  unreadCount: convo.unreadCount,
});

const validateText = (text: string): Readonly<{ text: string }> | BlueskyChatMessageInvalid => {
  const trimmed = text.trim();
  if (trimmed === '') return { type: 'BlueskyChatMessageInvalid', reason: 'empty' };
  if (graphemesOf(trimmed).length > BLUESKY_CHAT_MAX_GRAPHEMES) {
    return { type: 'BlueskyChatMessageInvalid', reason: 'too_many_graphemes' };
  }
  if (byteLengthOf(trimmed) > BLUESKY_CHAT_MAX_TEXT_BYTES) {
    return { type: 'BlueskyChatMessageInvalid', reason: 'too_many_bytes' };
  }
  return { text: trimmed };
};

const create = ({ chat, query }: Deps): BlueskyChatUseCases => {
  const summarized = async (
    fetched: RA<BlueskyChatConvo, BlueskyClientError>,
  ): RA<BlueskyChatConvoSummary, BlueskyClientError> => {
    const [convo, viewerDid] = await Promise.all([fetched, chat.viewerDid()]);
    if (!convo.ok) return convo;
    return viewerDid.ok ? RA.ok(summaryOf(convo.val, viewerDid.val)) : viewerDid;
  };

  return {
    listConvos: {
      run: async ({ cursor }) => {
        const [page, viewerDid] = await Promise.all([
          chat.listConvos({ limit: CONVOS_LIMIT, cursor }),
          chat.viewerDid(),
        ]);
        if (!page.ok) return page;
        if (!viewerDid.ok) return viewerDid;
        return RA.ok({
          convos: page.val.items.map((convo) => summaryOf(convo, viewerDid.val)),
          cursor: page.val.cursor ?? null,
        });
      },
    },
    getConvo: { run: ({ convoId }) => summarized(chat.getConvo(convoId)) },
    listMessages: {
      run: async ({ convoId, cursor }) => {
        const page = await chat.getMessages({ convoId, limit: MESSAGES_LIMIT, cursor });
        return page.ok
          ? RA.ok({ messages: [...page.val.items].reverse(), cursor: page.val.cursor ?? null, order: 'oldest_first' })
          : page;
      },
    },
    sendMessage: {
      run: async ({ convoId, text }) => {
        const validated = validateText(text);
        if ('type' in validated) return RA.err(validated);
        const facets = await buildFacets(validated.text, query);
        return chat.sendMessage({ convoId, text: validated.text, ...(facets.length === 0 ? {} : { facets }) });
      },
    },
    markRead: { run: ({ convoId, messageId }) => summarized(chat.updateRead({ convoId, messageId })) },
    acceptConvo: { run: ({ convoId }) => chat.acceptConvo(convoId) },
    openConvo: { run: ({ did }) => summarized(chat.getConvoForMember(did)) },
    unreadCount: {
      run: async () => {
        const page = await chat.listConvos({ limit: BLUESKY_CHAT_PAGE_LIMIT, readState: 'unread' });
        if (!page.ok) return page;
        const unmuted = page.val.items.filter((convo) => !convo.muted);
        return RA.ok({
          unread: unmuted
            .filter((convo) => convo.status === 'accepted')
            .reduce((total, convo) => total + convo.unreadCount, 0),
          requests: unmuted.filter((convo) => convo.status === 'request' && convo.unreadCount > 0).length,
        });
      },
    },
  };
};

export const BlueskyChatUseCases = { create } as const;
