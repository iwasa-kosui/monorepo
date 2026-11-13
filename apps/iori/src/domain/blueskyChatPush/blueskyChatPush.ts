import type { RA } from '@iwasa-kosui/result';

import type { Instant } from '../instant/instant.ts';

export const BLUESKY_CHAT_PUSH_BODY_MAX_GRAPHEMES = 100;

export type BlueskyChatPushReceipt = Readonly<{
  convoId: string;
  lastMessageId: string;
  notifiedAt: Instant;
}>;

export type BlueskyChatPushReceiptsResolverByConvoIds = Readonly<{
  resolve: (convoIds: readonly string[]) => RA<ReadonlyMap<string, string>, never>;
}>;
export type BlueskyChatPushReceiptsSavedStore = Readonly<{
  store: (...receipts: readonly BlueskyChatPushReceipt[]) => RA<void, never>;
}>;
