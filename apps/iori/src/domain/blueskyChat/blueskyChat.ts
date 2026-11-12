import type { BlueskyTimelineFacet } from '../blueskyTimeline/blueskyTimelineItem.ts';

export const BLUESKY_CHAT_MAX_GRAPHEMES = 1000;
export const BLUESKY_CHAT_MAX_TEXT_BYTES = 10_000;
export const BLUESKY_CHAT_PAGE_LIMIT = 100;

export type BlueskyChatMember = Readonly<{
  did: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
  chatDisabled: boolean;
}>;

export type BlueskyChatReaction = Readonly<{ value: string; senderDid: string }>;

export type BlueskyChatSharedPost = Readonly<{
  uri: string;
  authorHandle: string;
  authorDisplayName: string | null;
  text: string;
}>;

export type BlueskyChatTextMessage = Readonly<{
  kind: 'message';
  id: string;
  text: string;
  facets: readonly BlueskyTimelineFacet[];
  hasEmbed: boolean;
  sharedPost: BlueskyChatSharedPost | null;
  reactions: readonly BlueskyChatReaction[];
  senderDid: string;
  sentAt: number;
}>;

export type BlueskyChatMessage =
  | BlueskyChatTextMessage
  | Readonly<{ kind: 'deleted'; id: string; senderDid: string; sentAt: number }>
  | Readonly<{ kind: 'unsupported'; id: string | null; sentAt: number | null }>;

export type BlueskyChatConvoStatus = 'accepted' | 'request' | 'unknown';

export type BlueskyChatConvo = Readonly<{
  id: string;
  rev: string;
  members: readonly BlueskyChatMember[];
  lastMessage: BlueskyChatMessage | null;
  muted: boolean;
  status: BlueskyChatConvoStatus;
  unreadCount: number;
}>;

export type BlueskyChatMessageInvalidReason = 'empty' | 'too_many_graphemes' | 'too_many_bytes';

export type BlueskyChatMessageInvalid = Readonly<{
  type: 'BlueskyChatMessageInvalid';
  reason: BlueskyChatMessageInvalidReason;
}>;
