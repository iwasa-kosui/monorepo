import type { RA } from '@iwasa-kosui/result';

import type {
  BlueskyChatConvo,
  BlueskyChatMessage,
  BlueskyChatTextMessage,
} from '../domain/blueskyChat/blueskyChat.ts';
import type {
  BlueskyFacet,
  BlueskyMentionFacet,
  BlueskyTagFacet,
} from '../domain/blueskyCrosspost/blueskyPostRecord.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyChatPage<T> = Readonly<{ items: readonly T[]; cursor: string | undefined }>;

export type BlueskyChat = Readonly<{
  viewerDid: () => RA<string, BlueskyClientError>;
  listConvos: (
    input: Readonly<{ limit: number; cursor?: string | undefined; readState?: 'unread' | undefined }>,
  ) => RA<BlueskyChatPage<BlueskyChatConvo>, BlueskyClientError>;
  getConvo: (convoId: string) => RA<BlueskyChatConvo, BlueskyClientError>;
  getConvoForMember: (did: string) => RA<BlueskyChatConvo, BlueskyClientError>;
  getMessages: (
    input: Readonly<{ convoId: string; limit: number; cursor?: string | undefined }>,
  ) => RA<BlueskyChatPage<BlueskyChatMessage>, BlueskyClientError>;
  sendMessage: (
    input: Readonly<{
      convoId: string;
      text: string;
      facets?: ReadonlyArray<BlueskyFacet | BlueskyMentionFacet | BlueskyTagFacet> | undefined;
    }>,
  ) => RA<BlueskyChatTextMessage, BlueskyClientError>;
  updateRead: (
    input: Readonly<{ convoId: string; messageId?: string | undefined }>,
  ) => RA<BlueskyChatConvo, BlueskyClientError>;
  acceptConvo: (convoId: string) => RA<void, BlueskyClientError>;
}>;
