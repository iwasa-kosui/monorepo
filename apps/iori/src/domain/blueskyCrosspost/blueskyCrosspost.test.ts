import { describe, expect, it } from 'vitest';

import type { Visibility } from '../post/visibility.ts';
import { BlueskyCrosspost } from './blueskyCrosspost.ts';

const input = (overrides: Partial<Parameters<typeof BlueskyCrosspost.decideSkip>[0]> = {}) => ({
  visibility: 'public' as Visibility,
  replyTo: { kind: 'none' as const },
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
});
