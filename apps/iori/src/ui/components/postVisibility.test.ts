import { describe, expect, it } from 'vitest';

import { visibilityForDestination } from './postVisibility.ts';

describe('visibilityForDestination', () => {
  it.each(['public', 'unlisted', 'private'] as const)('送り先が Bluesky だけなら、%s を公開に戻す', (current) => {
    expect(visibilityForDestination('bluesky', current)).toBe('public');
  });

  it.each(['both', 'fediverse'] as const)('送り先が %s なら、選んだ公開範囲を残す', (destination) => {
    expect(visibilityForDestination(destination, 'private')).toBe('private');
  });
});
