import { describe, expect, it } from 'vitest';

import { visibilityForDestination, visibilityWhenDefaultLoaded } from './postVisibility.ts';

describe('visibilityForDestination', () => {
  it.each(['public', 'unlisted', 'private'] as const)('送り先が Bluesky だけなら、%s を公開に戻す', (current) => {
    expect(visibilityForDestination('bluesky', current)).toBe('public');
  });

  it.each(['both', 'fediverse'] as const)('送り先が %s なら、選んだ公開範囲を残す', (destination) => {
    expect(visibilityForDestination(destination, 'private')).toBe('private');
  });
});

describe('visibilityWhenDefaultLoaded', () => {
  it('利用者がまだ公開範囲を選んでいなければ、読み込んだ既定値にする', () => {
    expect(visibilityWhenDefaultLoaded('public', 'private', { touched: false, destination: 'both' })).toBe('private');
  });

  it('利用者が公開範囲を選んでいたら、選んだ値を残す', () => {
    expect(visibilityWhenDefaultLoaded('unlisted', 'private', { touched: true, destination: 'both' })).toBe('unlisted');
  });

  it('送り先が Bluesky だけなら、公開のままにする', () => {
    expect(visibilityWhenDefaultLoaded('public', 'private', { touched: false, destination: 'bluesky' })).toBe('public');
  });
});
