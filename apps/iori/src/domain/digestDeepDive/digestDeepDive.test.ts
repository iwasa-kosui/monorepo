import { describe, expect, it } from 'vitest';

import { ArticleId } from '../article/articleId.ts';
import { DigestItemId } from '../digest/digestItemId.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { DIGEST_DEEP_DIVE_MAX_TURNS, DigestDeepDive } from './digestDeepDive.ts';

const userId = UserId.generate();
const digestItemId = DigestItemId.generate();
const articleId = ArticleId.generate();
const t0 = Instant.orThrow(1_000);

const start = (instruction = '背景を知りたい') => {
  const started = DigestDeepDive.start(
    { userId, digestItemId, articleId, instruction, resultMarkdown: '- [A](https://example.com/a)' },
    t0,
  );
  if (!started.ok) throw new Error('start failed');
  return started.val;
};

describe('DigestDeepDive.addTurn', () => {
  it('次の往復を末尾に足し、updatedAt を進めて digestDeepDive.turnAdded を返す', () => {
    const deepDive = start().aggregateState;
    const t1 = Instant.orThrow(2_000);

    const added = DigestDeepDive.addTurn(deepDive, { instruction: '続き', resultMarkdown: '- 続き' }, t1);

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.val).toMatchObject({
      eventName: 'digestDeepDive.turnAdded',
      eventPayload: { deepDiveId: deepDive.deepDiveId, turn: { turnNumber: 2, instruction: '続き' } },
      aggregateState: { createdAt: t0, updatedAt: t1 },
    });
    expect(added.val.aggregateState.turns.map((turn) => turn.turnNumber)).toEqual([1, 2]);
  });

  it(`${DIGEST_DEEP_DIVE_MAX_TURNS} 往復に達していれば DigestDeepDiveTurnLimitError を返す`, () => {
    let deepDive = start().aggregateState;
    for (let turn = 2; turn <= DIGEST_DEEP_DIVE_MAX_TURNS; turn += 1) {
      const added = DigestDeepDive.addTurn(deepDive, { instruction: '', resultMarkdown: '- a' }, t0);
      if (!added.ok) throw new Error('addTurn failed');
      deepDive = added.val.aggregateState;
    }

    const result = DigestDeepDive.addTurn(deepDive, { instruction: '', resultMarkdown: '- a' }, t0);

    expect(DigestDeepDive.isTurnLimitReached(deepDive)).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      err: { type: 'DigestDeepDiveTurnLimitError', detail: { deepDiveId: deepDive.deepDiveId } },
    });
  });
});
