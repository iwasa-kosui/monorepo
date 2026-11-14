import { describe, expect, it } from 'vitest';

import {
  type BlueskyInteractionDraft,
  blueskyInteractionParamsOf,
  DEFAULT_BLUESKY_INTERACTION_DRAFT,
} from './blueskyInteractionDraft.ts';

const draft = (overrides: Partial<BlueskyInteractionDraft>): BlueskyInteractionDraft => ({
  ...DEFAULT_BLUESKY_INTERACTION_DRAFT,
  ...overrides,
});

describe('blueskyInteractionParamsOf', () => {
  it('既定のときは reply_allow も quote_disabled も含めない', () => {
    expect(blueskyInteractionParamsOf(DEFAULT_BLUESKY_INTERACTION_DRAFT)).toEqual({});
  });

  it('誰でもを選んでいれば、チェックを残していても reply_allow を含めない', () => {
    expect(blueskyInteractionParamsOf(draft({ replyMode: 'everyone', audiences: ['mention'] }))).toEqual({});
  });

  it('返信を受け付けないなら reply_allow を空配列にする', () => {
    expect(blueskyInteractionParamsOf(draft({ replyMode: 'nobody', audiences: ['mention'] }))).toEqual({
      reply_allow: [],
    });
  });

  it('指定した人だけなら、選んだ人を mention・following・followers の順で reply_allow にする', () => {
    expect(blueskyInteractionParamsOf(draft({ replyMode: 'selected', audiences: ['followers', 'mention'] }))).toEqual({
      reply_allow: ['mention', 'followers'],
    });
  });

  it('指定した人だけで 1 人も選んでいなければ、返信を受け付けないときと同じ空配列にする', () => {
    expect(blueskyInteractionParamsOf(draft({ replyMode: 'selected', audiences: [] }))).toEqual({ reply_allow: [] });
  });

  it('引用を許可しないときだけ quote_disabled を true にして含める', () => {
    expect(blueskyInteractionParamsOf(draft({ quoteDisabled: true }))).toEqual({ quote_disabled: true });
  });
});
