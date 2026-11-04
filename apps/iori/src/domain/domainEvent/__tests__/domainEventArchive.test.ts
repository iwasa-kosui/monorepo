import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../adaptor/crypto/sha256Hex.ts';
import { Instant } from '../../instant/instant.ts';
import { type ArchivedDomainEvent, DomainEventArchive } from '../domainEventArchive.ts';

const event = (eventName: string, aggregateId: string): ArchivedDomainEvent => ({
  eventId: 'e1',
  aggregateId,
  aggregateName: 'session',
  aggregateState: '{"a":1}',
  eventName,
  eventPayload: '{"b":2}',
  occurredAt: Instant.orThrow(Date.UTC(2026, 9, 20)),
});

describe('DomainEventArchive.redact', () => {
  const redact = DomainEventArchive.redact(sha256Hex);
  const sessionId = '"cookie-session-id-value"';

  it('session.started の aggregate_id を sha256:<16進> にし、元の値を含めない', async () => {
    const redacted = await redact(event('session.started', sessionId));

    expect(redacted.aggregateId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(redacted.aggregateId).not.toContain('cookie-session-id-value');
    expect(redacted).toMatchObject({ aggregateState: null, eventPayload: null });
  });

  it('JSON 文字列全体をハッシュする', async () => {
    const redacted = await redact(event('session.started', '"abc"'));

    expect(redacted.aggregateId).toBe(
      'sha256:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25',
    );
  });

  it('同じ入力なら同じ値になり、違う入力なら違う値になる', async () => {
    const first = await redact(event('session.started', sessionId));
    const second = await redact(event('session.started', sessionId));
    const other = await redact(event('session.started', '"other"'));

    expect(second.aggregateId).toBe(first.aggregateId);
    expect(other.aggregateId).not.toBe(first.aggregateId);
  });

  it('他のイベントの aggregate_id は変えない', async () => {
    const plain = event('post.created', '"post-1"');
    const keyCreated = event('key.created', '"key-1"');

    expect((await redact(plain)).aggregateId).toBe('"post-1"');
    expect(await redact(plain)).toEqual(plain);
    expect((await redact(keyCreated)).aggregateId).toBe('"key-1"');
  });
});
