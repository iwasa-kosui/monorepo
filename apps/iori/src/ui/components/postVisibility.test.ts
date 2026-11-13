import { describe, expect, it } from 'vitest';

import {
  visibilityForDestination,
  visibilityWhenDefaultLoaded,
  visibilityWhenDestinationChanged,
} from './postVisibility.ts';

describe('visibilityWhenDestinationChanged', () => {
  it.each(['public', 'unlisted', 'private'] as const)(
    '送り先が Bluesky だけなら、手で変えたかに関わらず %s を公開にする',
    (current) => {
      expect(visibilityWhenDestinationChanged(current, 'bluesky', 'private', false)).toBe('public');
      expect(visibilityWhenDestinationChanged(current, 'bluesky', 'private', true)).toBe('public');
    },
  );

  it.each(['both', 'fediverse'] as const)('手で変えていなければ、送り先が %s に戻ると既定値に戻す', (destination) => {
    expect(visibilityWhenDestinationChanged('public', destination, 'private', false)).toBe('private');
  });

  it('既定値が非公開のとき、both から Bluesky だけを経て both に戻すと非公開に戻る', () => {
    const toBluesky = visibilityWhenDestinationChanged('private', 'bluesky', 'private', false);
    const backToBoth = visibilityWhenDestinationChanged(toBluesky, 'both', 'private', false);

    expect(toBluesky).toBe('public');
    expect(backToBoth).toBe('private');
  });

  it.each(['both', 'fediverse'] as const)('手で変えていたら、送り先が %s でも現在の値を残す', (destination) => {
    expect(visibilityWhenDestinationChanged('unlisted', destination, 'private', true)).toBe('unlisted');
  });
});

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
