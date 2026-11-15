import { describe, expect, it } from 'vitest';

import type { Visibility } from '../post/visibility.ts';
import { BlueskyCrosspost } from './blueskyCrosspost.ts';

const input = (overrides: Partial<Parameters<typeof BlueskyCrosspost.decideSkip>[0]> = {}) => ({
  visibility: 'public' as Visibility,
  replyTo: { kind: 'none' as const },
  html: '<p>こんにちは</p>',
  ...overrides,
});

describe('BlueskyCrosspost.decideSkip', () => {
  it('public で他に理由がなければスキップしない', () => {
    expect(BlueskyCrosspost.decideSkip(input())).toBeUndefined();
  });

  it.each(['unlisted', 'private', 'direct'] as const)('%s は visibility でスキップする', (visibility) => {
    expect(BlueskyCrosspost.decideSkip(input({ visibility }))).toBe('visibility');
  });

  it('visibility を返信先が未送信の理由より先に判定する', () => {
    expect(BlueskyCrosspost.decideSkip(input({ visibility: 'private', replyTo: { kind: 'unsent' } })))
      .toBe('visibility');
  });

  it('public で返信先が未送信なら reply_to_unsent でスキップする', () => {
    expect(BlueskyCrosspost.decideSkip(input({ replyTo: { kind: 'unsent' } }))).toBe('reply_to_unsent');
  });

  it('Fediverse のアカウントへのメンションを含むなら fediverse_mention でスキップする', () => {
    const html =
      '<p><span class="h-card"><a href="https://bot.example/users/bot" class="u-url mention">@<span>bot@bot.example</span></a></span> おはよう</p>';
    expect(BlueskyCrosspost.decideSkip(input({ html }))).toBe('fediverse_mention');
  });

  it('Bluesky のハンドルやふつうのリンクだけならスキップしない', () => {
    const html = '<p>@alice.bsky.social <a href="https://example.com/@bob">example.com/@bob</a></p>';
    expect(BlueskyCrosspost.decideSkip(input({ html }))).toBeUndefined();
  });
});
