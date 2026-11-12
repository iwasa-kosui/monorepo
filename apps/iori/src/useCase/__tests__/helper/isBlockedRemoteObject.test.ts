import { describe, expect, it } from 'vitest';

import { isBlockedRemoteObject } from '../../helper/isBlockedRemoteObject.ts';

const isBlockedUri = (uri: string) => new URL(uri).hostname === 'blocked.example';

describe('isBlockedRemoteObject', () => {
  it('returns true when the id is on a blocked domain', () => {
    const object = { id: new URL('https://blocked.example/notes/1'), attributionIds: [] };

    expect(isBlockedRemoteObject(object, isBlockedUri)).toBe(true);
  });

  it('returns true when one of the attributionIds is on a blocked domain', () => {
    const object = {
      id: new URL('https://remote.example/notes/1'),
      attributionIds: [new URL('https://remote.example/users/alice'), new URL('https://blocked.example/users/bob')],
    };

    expect(isBlockedRemoteObject(object, isBlockedUri)).toBe(true);
  });

  it('returns false when neither the id nor the attributionIds are on a blocked domain', () => {
    const object = {
      id: new URL('https://remote.example/notes/1'),
      attributionIds: [new URL('https://remote.example/users/alice')],
    };

    expect(isBlockedRemoteObject(object, isBlockedUri)).toBe(false);
  });

  it('checks only the attributionIds when the id is null', () => {
    expect(isBlockedRemoteObject({ id: null, attributionIds: [] }, isBlockedUri)).toBe(false);
    expect(
      isBlockedRemoteObject({ id: null, attributionIds: [new URL('https://blocked.example/users/bob')] }, isBlockedUri),
    ).toBe(true);
  });
});
