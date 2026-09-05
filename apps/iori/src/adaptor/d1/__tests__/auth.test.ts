import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { User } from '../../../domain/user/user.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1UserCreatedStore } from '../user/userCreatedStore.ts';
import { createD1UserResolverByUsername } from '../user/userResolverByUsername.ts';

describe('D1 auth adapters', () => {
  it('maps a username row to a parsed domain user', async () => {
    const userId = UserId.generate();
    const username = Username.orThrow('kosui');
    const where = vi.fn(async () => [{ userId, username }]);
    const db = {
      select: () => ({
        from: () => ({ where }),
      }),
    } as unknown as IoriD1Db;

    const result = await createD1UserResolverByUsername(db).resolve(username);

    expect(result).toEqual({
      ok: true,
      val: { id: userId, username },
      err: undefined,
    });
    expect(where).toHaveBeenCalledOnce();
  });

  it('persists a user and serialized event in one batch', async () => {
    const insert = vi.fn((table: unknown) => ({
      values: (values: unknown) => ({ table, values }),
    }));
    const batch = vi.fn(async (_queries: unknown[]) => []);
    const db = { insert, batch } as unknown as IoriD1Db;
    const event = User.createUser(Instant.now())({
      username: Username.orThrow('kosui'),
    });

    const result = await createD1UserCreatedStore(db).store(event);

    expect(result.ok).toBe(true);
    expect(batch).toHaveBeenCalledOnce();
    const [userInsert, eventInsert] = batch.mock.calls[0][0] as Array<{
      values: Record<string, unknown>;
    }>;
    expect(userInsert.values).toEqual({
      userId: event.aggregateState.id,
      username: event.aggregateState.username,
    });
    expect(eventInsert.values).toMatchObject({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: JSON.stringify(event.aggregateState),
      eventName: event.eventName,
      eventPayload: JSON.stringify(event.eventPayload),
    });
    expect(eventInsert.values.occurredAt).toEqual(new Date(event.occurredAt));
  });
});
