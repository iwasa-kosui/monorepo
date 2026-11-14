import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { UserPreferences } from './userPreferences.ts';

const userId = UserId.generate();

describe('UserPreferences', () => {
  it('2 回目の保存では createdAt を保ち、値と updatedAt を更新する', () => {
    const first = UserPreferences.save(
      { userId, defaultPostVisibility: 'unlisted' },
      undefined,
      Instant.orThrow(1_000),
    );

    const second = UserPreferences.save(
      { userId, defaultPostVisibility: 'private' },
      first.aggregateState,
      Instant.orThrow(5_000),
    );

    expect(second.aggregateState).toEqual({
      userId,
      defaultPostVisibility: 'private',
      createdAt: 1_000,
      updatedAt: 5_000,
    });
  });
});
