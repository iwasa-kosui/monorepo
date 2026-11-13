import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { type BlueskyInteractionDraft, DEFAULT_BLUESKY_INTERACTION_DRAFT } from './blueskyInteractionDraft.ts';
import { BlueskyInteractionSettings } from './BlueskyInteractionSettings.tsx';

const render = (overrides: Partial<BlueskyInteractionDraft> = {}, disabled = false): string =>
  String(jsx(BlueskyInteractionSettings, {
    value: { ...DEFAULT_BLUESKY_INTERACTION_DRAFT, ...overrides },
    onChange: () => {},
    name: 'interaction',
    disabled,
  }));

describe('BlueskyInteractionSettings', () => {
  it('返信できる人の radiogroup に、誰でも・返信を受け付けない・指定した人だけの 3 つを出す', () => {
    const html = render();

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="返信できる人"');
    expect(html).toContain('誰でも');
    expect(html).toContain('返信を受け付けない');
    expect(html).toContain('指定した人だけ');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('name="interaction-reply-mode"');
  });

  it('初期状態では「誰でも」を選び、人の指定のチェックボックスと説明文を出さない', () => {
    const html = render();

    expect(html).toMatch(/<input[^>]*value="everyone"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*value="nobody"[^>]*checked/);
    expect(html).not.toContain('メンションした人');
    expect(html).not.toContain('返信を受け付けない設定になります');
  });

  it('引用を許可しないチェックボックスを、初期状態では外して出す', () => {
    const html = render();

    expect(html).toContain('引用を許可しない');
    expect(html).toMatch(/<input[^>]*name="interaction-quote-disabled"/);
    expect(html).not.toMatch(/<input[^>]*name="interaction-quote-disabled"[^>]*checked/);
    expect(render({ quoteDisabled: true })).toMatch(/<input[^>]*name="interaction-quote-disabled"[^>]*checked/);
  });

  it('返信を受け付けないを選んでいても、人の指定のチェックボックスは出さない', () => {
    const html = render({ replyMode: 'nobody' });

    expect(html).toMatch(/<input[^>]*value="nobody"[^>]*checked/);
    expect(html).not.toContain('メンションした人');
  });

  it('指定した人だけを選ぶと、メンションした人・フォローしている人・フォロワーのチェックボックスを出す', () => {
    const html = render({ replyMode: 'selected', audiences: ['following'] });

    expect(html).toContain('メンションした人');
    expect(html).toContain('フォローしている人');
    expect(html).toContain('フォロワー');
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
    expect(html).toMatch(/<input[^>]*value="following"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*value="mention"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*value="followers"[^>]*checked/);
  });

  it('指定した人だけで 1 人も選んでいなければ、返信を受け付けない設定になる説明文を出す', () => {
    const html = render({ replyMode: 'selected' });

    expect(html).toContain('1人も選ばないまま投稿すると、返信を受け付けない設定になります');
    expect(html).toContain('aria-describedby=');
  });

  it('1 人でも選んでいれば説明文を出さない', () => {
    expect(render({ replyMode: 'selected', audiences: ['mention'] })).not.toContain('返信を受け付けない設定になります');
  });

  it('disabled のとき、すべての入力を無効にする', () => {
    const html = render({ replyMode: 'selected' }, true);

    expect(html.match(/<input/g)).toHaveLength(7);
    expect(html.match(/<input[^>]*disabled/g)).toHaveLength(7);
  });
});
