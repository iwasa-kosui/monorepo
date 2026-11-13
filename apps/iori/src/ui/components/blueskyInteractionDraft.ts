import { BlueskyReplyAudience } from '../../domain/blueskyCrosspost/blueskyInteraction.ts';
import type { BlueskyInteractionParams } from '../api/mastodonClient.ts';

export type BlueskyReplyMode = 'everyone' | 'nobody' | 'selected';

export type BlueskyInteractionDraft = Readonly<{
  replyMode: BlueskyReplyMode;
  audiences: readonly BlueskyReplyAudience[];
  quoteDisabled: boolean;
}>;

export const DEFAULT_BLUESKY_INTERACTION_DRAFT: BlueskyInteractionDraft = {
  replyMode: 'everyone',
  audiences: [],
  quoteDisabled: false,
};

export const isDefaultBlueskyInteractionDraft = (draft: BlueskyInteractionDraft): boolean =>
  draft.replyMode === 'everyone' && !draft.quoteDisabled;

export const isSelectedWithoutAudience = (draft: BlueskyInteractionDraft): boolean =>
  draft.replyMode === 'selected' && draft.audiences.length === 0;

const replyAllowOf = (draft: BlueskyInteractionDraft): readonly BlueskyReplyAudience[] | undefined => {
  if (draft.replyMode === 'everyone') return undefined;
  if (draft.replyMode === 'nobody') return [];
  return BlueskyReplyAudience.values.filter((audience) => draft.audiences.includes(audience));
};

export const blueskyInteractionParamsOf = (draft: BlueskyInteractionDraft): BlueskyInteractionParams => {
  const replyAllow = replyAllowOf(draft);
  return {
    ...(replyAllow === undefined ? {} : { reply_allow: replyAllow }),
    ...(draft.quoteDisabled ? { quote_disabled: true } : {}),
  };
};
