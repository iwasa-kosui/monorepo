import { describe, expect, it } from 'vitest';

import { isWiderThan, replyVisibilityDefault, visibilityForDestination } from './postVisibility.ts';

describe('visibilityForDestination', () => {
  it.each(['public', 'unlisted', 'private'] as const)('送り先が Bluesky だけなら、%s を公開に戻す', (current) => {
    expect(visibilityForDestination('bluesky', current)).toBe('public');
  });

  it.each(['both', 'fediverse'] as const)('送り先が %s なら、選んだ公開範囲を残す', (destination) => {
    expect(visibilityForDestination(destination, 'private')).toBe('private');
  });
});

describe('replyVisibilityDefault', () => {
  it('返信先が分からなければ、既定の公開にする', () => {
    expect(replyVisibilityDefault(undefined)).toBe('public');
  });

  it.each(
    [
      ['public', 'public'],
      ['unlisted', 'unlisted'],
      ['private', 'private'],
    ] as const,
  )('返信先が %s なら、%s にする', (parent, expected) => {
    expect(replyVisibilityDefault(parent)).toBe(expected);
  });

  it('返信先がダイレクトなら、フォロワー限定にする', () => {
    expect(replyVisibilityDefault('direct')).toBe('private');
  });
});

describe('isWiderThan', () => {
  it.each(
    [
      ['public', 'unlisted'],
      ['public', 'private'],
      ['public', 'direct'],
      ['unlisted', 'private'],
      ['unlisted', 'direct'],
      ['private', 'direct'],
    ] as const,
  )('%s は %s より広い', (option, parent) => {
    expect(isWiderThan(option, parent)).toBe(true);
  });

  it.each(
    [
      ['public', 'public'],
      ['unlisted', 'public'],
      ['unlisted', 'unlisted'],
      ['private', 'unlisted'],
      ['private', 'private'],
    ] as const,
  )('%s は %s より広くない', (option, parent) => {
    expect(isWiderThan(option, parent)).toBe(false);
  });
});
