import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { BlueskyAccountSwitch } from './blueskyAccountSwitch.ts';

const NOW = Instant.orThrow(1_800_000_000_000);
const started = () =>
  Result.unsafeUnwrap(BlueskyAccountSwitch.start(NOW)({ fromDid: 'did:plc:old', toDid: 'did:plc:new' }));

describe('BlueskyAccountSwitch', () => {
  it('start は切り替えの開始のイベントと、件数が 0 の状態を作る', () => {
    const event = started();

    expect(event).toMatchObject({
      aggregateName: 'blueskyAccountSwitch',
      eventName: 'blueskyAccountSwitch.started',
      eventPayload: { fromDid: 'did:plc:old', toDid: 'did:plc:new', startedAt: NOW },
      aggregateState: { attempts: 0, lastError: null, startedAt: NOW, deletedCounts: BlueskyAccountSwitch.emptyCounts },
    });
    expect(event.aggregateId).toBe(event.aggregateState.switchId);
  });

  it('start は、同じ DID への切り替えを拒む', () => {
    expect(BlueskyAccountSwitch.start(NOW)({ fromDid: 'did:plc:old', toDid: 'did:plc:old' })).toMatchObject({
      ok: false,
      err: { type: 'BlueskyAccountSwitchSameAccountError' },
    });
  });

  it('complete は、状態を持たない完了のイベントに、前後の DID と削除件数を載せる', () => {
    const state = BlueskyAccountSwitch.recordDeleted(started().aggregateState, 'likes', 7, NOW);

    const event = BlueskyAccountSwitch.complete(Instant.orThrow(NOW + 1))(state);

    expect(event).toMatchObject({
      aggregateId: state.switchId,
      eventName: 'blueskyAccountSwitch.completed',
      aggregateState: undefined,
      eventPayload: {
        fromDid: 'did:plc:old',
        toDid: 'did:plc:new',
        startedAt: NOW,
        deletedCounts: { likes: 7, timelineItems: 0 },
      },
    });
  });

  it('fail は試行回数を増やし、lastError を 200 文字までにする', () => {
    const failed = BlueskyAccountSwitch.fail(started().aggregateState, 'x'.repeat(300), NOW);

    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toHaveLength(200);
  });

  it('isStalled は試行が 30 回を超えたときだけ true にする', () => {
    const state = started().aggregateState;

    expect(BlueskyAccountSwitch.isStalled({ ...state, attempts: 30 })).toBe(false);
    expect(BlueskyAccountSwitch.isStalled({ ...state, attempts: 31 })).toBe(true);
  });

  it('isPurgeable は開始から 90 秒経ってから true にする', () => {
    const state = started().aggregateState;

    expect(BlueskyAccountSwitch.isPurgeable(state, Instant.orThrow(NOW + 89_999))).toBe(false);
    expect(BlueskyAccountSwitch.isPurgeable(state, Instant.orThrow(NOW + 90_000))).toBe(true);
  });

  it('toView は、印が無ければ idle、あれば purging を返す', () => {
    expect(BlueskyAccountSwitch.toView(undefined)).toEqual({ state: 'idle' });
    expect(BlueskyAccountSwitch.toView({ ...started().aggregateState, attempts: 2, lastError: 'boom' })).toEqual({
      state: 'purging',
      fromDid: 'did:plc:old',
      toDid: 'did:plc:new',
      startedAt: NOW,
      attempts: 2,
      lastError: 'boom',
      stalled: false,
    });
  });
});
