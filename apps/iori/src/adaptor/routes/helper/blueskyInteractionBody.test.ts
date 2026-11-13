import { describe, expect, it } from 'vitest';

import { blueskyInteractionOf } from './blueskyInteractionBody.ts';

describe('blueskyInteractionOf', () => {
  it('フィールドが無ければ既定 (誰でも返信できる・引用を許可する) にする', () => {
    expect(blueskyInteractionOf({})).toEqual({ interaction: { replyRestriction: 'everyone', quoteDisabled: false } });
  });

  it('空配列は、フィールドが無いときと区別して、誰も返信できないことにする', () => {
    expect(blueskyInteractionOf({ reply_allow: [] })).toEqual({
      interaction: { replyRestriction: [], quoteDisabled: false },
    });
  });

  it('reply_allow を mention・following・followers の順にそろえ、重複を除く', () => {
    expect(blueskyInteractionOf({ reply_allow: ['followers', 'mention', 'followers'] })).toEqual({
      interaction: { replyRestriction: ['mention', 'followers'], quoteDisabled: false },
    });
  });

  it('フォームの単一の値は 1 要素の配列として扱う', () => {
    expect(blueskyInteractionOf({ reply_allow: 'following' })).toEqual({
      interaction: { replyRestriction: ['following'], quoteDisabled: false },
    });
  });

  it('quote_disabled は真偽値と真偽を表す文字列を受け付ける', () => {
    for (const value of [true, 'true', '1', 'on']) {
      expect(blueskyInteractionOf({ quote_disabled: value })).toEqual({
        interaction: { replyRestriction: 'everyone', quoteDisabled: true },
      });
    }
    for (const value of [false, 'false', '0', 'off', '']) {
      expect(blueskyInteractionOf({ quote_disabled: value })).toEqual({
        interaction: { replyRestriction: 'everyone', quoteDisabled: false },
      });
    }
  });

  it('不正な reply_allow はエラーにする', () => {
    for (const value of [['list'], ['mention', 1], 1, null, { mention: true }, 'everyone', ['everyone']]) {
      expect(blueskyInteractionOf({ reply_allow: value })).toEqual({ error: expect.stringContaining('reply_allow') });
    }
  });

  it('不正な quote_disabled はエラーにする', () => {
    for (const value of ['maybe', 1, null, [], {}]) {
      expect(blueskyInteractionOf({ quote_disabled: value })).toEqual({
        error: expect.stringContaining('quote_disabled'),
      });
    }
  });
});
