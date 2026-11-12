import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { UserId } from '../../user/userId.ts';
import { AlreadyBlockedError, Block, CannotBlockSelfError, NotBlockedError } from '../block.ts';
import { BlockId } from '../blockId.ts';

const block = {
  blockId: BlockId.generate(),
  userId: UserId.generate(),
  blockedActorId: ActorId.generate(),
};

describe('Block', () => {
  it('createBlock は block.blockCreated を作り、集約の状態に Block を持つ', () => {
    const event = Block.createBlock(block, Instant.orThrow(1_000));

    expect(event).toMatchObject({
      aggregateName: 'block',
      aggregateId: { blockId: block.blockId },
      aggregateState: block,
      eventName: 'block.blockCreated',
      eventPayload: block,
    });
  });

  it('deleteBlock は block.blockDeleted を作り、集約の状態を持たない', () => {
    const event = Block.deleteBlock(block, Instant.orThrow(2_000));

    expect(event).toMatchObject({
      aggregateName: 'block',
      aggregateId: { blockId: block.blockId },
      aggregateState: undefined,
      eventName: 'block.blockDeleted',
      eventPayload: { blockId: block.blockId },
    });
  });

  it('エラーは種類と対象を持つ', () => {
    const input = { userId: block.userId, blockedActorId: block.blockedActorId };

    expect(AlreadyBlockedError.create(input)).toMatchObject({ type: 'AlreadyBlockedError', detail: input });
    expect(NotBlockedError.create(input)).toMatchObject({ type: 'NotBlockedError', detail: input });
    expect(CannotBlockSelfError.create({ userId: block.userId, actorId: block.blockedActorId })).toMatchObject({
      type: 'CannotBlockSelfError',
      detail: { userId: block.userId, actorId: block.blockedActorId },
    });
  });
});
