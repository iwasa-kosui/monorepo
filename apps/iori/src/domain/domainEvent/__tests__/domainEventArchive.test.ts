import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../adaptor/crypto/sha256Hex.ts';
import { Instant } from '../../instant/instant.ts';
import {
  ARCHIVE_PLAIN_EVENT_NAMES,
  ARCHIVE_REDACTED_EVENT_NAMES,
  type ArchivedDomainEvent,
  DomainEventArchive,
} from '../domainEventArchive.ts';

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

const srcDirectory = fileURLToPath(new URL('../../../', import.meta.url));

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(`${path}/`);
    return entry.name.endsWith('.ts') && !entry.name.includes('.test.') ? [path] : [];
  });

const eventNamesInSource = (): string[] => {
  const name = String.raw`'([a-z][A-Za-z]*\.[A-Za-z]+)'`;
  const patterns = [
    new RegExp(String.raw`Event<[^;]*?,\s*${name}`, 'g'),
    new RegExp(String.raw`eventName\s*=\s*${name}`, 'g'),
    new RegExp(String.raw`eventName:\s*${name}`, 'g'),
    new RegExp(String.raw`Event\.create\(\s*[^,]+,\s*[^,]+,\s*${name}`, 'g'),
  ];
  const names = sourceFiles(srcDirectory).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1]!));
  });
  return [...new Set(names)].sort();
};

describe('archive event name lists', () => {
  const plain: readonly string[] = ARCHIVE_PLAIN_EVENT_NAMES;
  const redacted: readonly string[] = ARCHIVE_REDACTED_EVENT_NAMES;

  it('src のイベント名がすべて PLAIN か REDACTED のどちらか一方だけに入っている', () => {
    const names = eventNamesInSource();

    expect(names.length).toBeGreaterThan(60);
    for (const name of names) {
      expect(plain.includes(name) !== redacted.includes(name), name).toBe(true);
    }
  });

  it('PLAIN と REDACTED は重ならず、どちらにも src に無い名前を含まない', () => {
    const names = new Set(eventNamesInSource());

    expect(plain.filter((name) => redacted.includes(name))).toEqual([]);
    expect([...plain, ...redacted].filter((name) => !names.has(name))).toEqual([]);
    expect(new Set(plain).size).toBe(plain.length);
  });

  it('許可の一覧にも秘密の一覧にも無いイベントは state と payload を NULL にする', async () => {
    const redacted = await DomainEventArchive.redact(sha256Hex)(event('newThing.happened', '"x"'));

    expect(redacted).toMatchObject({ aggregateState: null, eventPayload: null });
    expect(DomainEventArchive.unknownEventNames([event('newThing.happened', '"x"'), event('post.created', '"y"')]))
      .toEqual(['newThing.happened']);
  });
});
