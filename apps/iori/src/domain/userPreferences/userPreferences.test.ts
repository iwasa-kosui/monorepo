import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { DefaultPostVisibility, UserPreferences } from './userPreferences.ts';

const userId = UserId.generate();

describe('UserPreferences', () => {
  it('初めての保存では createdAt と updatedAt が同じ時刻になり、イベントが状態と payload に同じ値を持つ', () => {
    const event = UserPreferences.save(
      { userId, defaultPostVisibility: 'unlisted' },
      undefined,
      Instant.orThrow(1_000),
    );

    expect(event.eventName).toBe('userPreferences.saved');
    expect(event.aggregateId).toEqual({ userId });
    expect(event.aggregateState).toEqual({
      userId,
      defaultPostVisibility: 'unlisted',
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    expect(event.eventPayload).toEqual(event.aggregateState);
    expect(event.occurredAt).toBe(1_000);
  });

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

  it('公開範囲の既定値に public、unlisted、private だけを受け付ける', () => {
    expect(DefaultPostVisibility.values).toEqual(['public', 'unlisted', 'private']);
    expect(DefaultPostVisibility.parse('direct').ok).toBe(false);
    expect(DefaultPostVisibility.parse('').ok).toBe(false);
    expect(DefaultPostVisibility.parse('unlisted').ok).toBe(true);
  });

  it('不正な公開範囲を持つ値を保存しようとすると例外にする', () => {
    expect(() =>
      UserPreferences.save(
        { userId, defaultPostVisibility: 'direct' as unknown as DefaultPostVisibility },
        undefined,
        Instant.orThrow(1_000),
      )
    ).toThrow();
  });
});
