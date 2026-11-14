import { describe, expect, it } from 'vitest';

import { Visibility } from '../visibility.ts';

const publicUri = 'https://www.w3.org/ns/activitystreams#Public';
const followersUri = 'https://remote.example/users/alice/followers';
const bobUri = 'https://remote.example/users/bob';

describe('Visibility.fromAddressing', () => {
  it.each([publicUri, 'as:Public', 'Public'])('returns public when to contains %s', (address) => {
    expect(Visibility.fromAddressing({ to: [address], cc: [followersUri], followersUri })).toBe('public');
  });

  it.each([publicUri, 'as:Public', 'Public'])('returns unlisted when only cc contains %s', (address) => {
    expect(Visibility.fromAddressing({ to: [followersUri], cc: [address], followersUri })).toBe('unlisted');
  });

  it('returns private when the followers collection is in to', () => {
    expect(Visibility.fromAddressing({ to: [followersUri], cc: [], followersUri })).toBe('private');
  });

  it('returns private when the followers collection is in cc', () => {
    expect(Visibility.fromAddressing({ to: [bobUri], cc: [followersUri], followersUri })).toBe('private');
  });

  it('returns direct when only individual recipients are addressed', () => {
    expect(Visibility.fromAddressing({ to: [bobUri], cc: [], followersUri })).toBe('direct');
  });

  it('returns direct when the followers collection is unknown', () => {
    expect(Visibility.fromAddressing({ to: [followersUri], cc: [], followersUri: undefined })).toBe('direct');
    expect(Visibility.fromAddressing({ to: [followersUri], cc: [], followersUri: null })).toBe('direct');
  });

  it('returns direct when nothing is addressed', () => {
    expect(Visibility.fromAddressing({ to: [], cc: [], followersUri })).toBe('direct');
  });

  it('does not treat another actor followers collection as the author followers', () => {
    expect(
      Visibility.fromAddressing({ to: ['https://remote.example/users/bob/followers'], cc: [], followersUri }),
    ).toBe('direct');
  });
});

describe('Visibility.narrowestOf', () => {
  const order = ['public', 'unlisted', 'private', 'direct'] as const;

  it.each(order.flatMap((a, i) => order.map((b, j) => ({ a, b, expected: order[Math.max(i, j)]! }))))(
    '$a と $b のうち狭い方 $expected を返す',
    ({ a, b, expected }) => {
      expect(Visibility.narrowestOf(a, b)).toBe(expected);
    },
  );
});
