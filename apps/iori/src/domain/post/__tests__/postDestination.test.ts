import { describe, expect, it } from 'vitest';

import { PostDestination } from '../postDestination.ts';

describe('PostDestination', () => {
  it.each(['both', 'fediverse'])('%s を受け付ける', (value) => {
    expect(PostDestination.parse(value)).toMatchObject({ ok: true, val: value });
  });

  it.each(['bluesky', '', 'BOTH', 1, null, undefined])('%s を受け付けない', (value) => {
    expect(PostDestination.parse(value).ok).toBe(false);
  });

  it('Bluesky に送るのは both のときだけ', () => {
    expect(PostDestination.sendsToBluesky('both')).toBe(true);
    expect(PostDestination.sendsToBluesky('fediverse')).toBe(false);
  });
});
