import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../adaptor/crypto/sha256Hex.ts';
import { toD1DomainEventRow } from '../../../adaptor/d1/eventRow.ts';
import { ActorId } from '../../actor/actorId.ts';
import { FeedEntry } from '../../feedEntry/feedEntry.ts';
import { FeedSource } from '../../feedSource/feedSource.ts';
import { Instant } from '../../instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../interestSource/embedding.ts';
import { PostId } from '../../post/postId.ts';
import { Report } from '../../report/report.ts';
import { UserId } from '../../user/userId.ts';
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

  it('session.ended も aggregate_id をハッシュし、内容を伏せる', async () => {
    const redacted = await redact(event('session.ended', sessionId));

    expect(redacted.aggregateId).toMatch(/^sha256:[0-9a-f]{64}$/);
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

describe('DomainEventArchive.redact の feed イベント', () => {
  const redact = DomainEventArchive.redact(sha256Hex);
  const now = Instant.orThrow(Date.UTC(2026, 9, 20));
  const archived = (domainEvent: Parameters<typeof toD1DomainEventRow>[0]): ArchivedDomainEvent => {
    const row = toD1DomainEventRow(domainEvent);
    return { ...row, occurredAt: now };
  };
  const unwrap = <T>(result: { ok: true; val: T } | { ok: false }): T => {
    if (!result.ok) throw new Error('unexpected err');
    return result.val;
  };

  const xSource = unwrap(FeedSource.createFeedSource(
    { kind: 'x_user', url: 'https://x.com/secret_user', title: '@secret_user' },
    now,
  ));
  const rssSource = unwrap(FeedSource.createFeedSource(
    { kind: 'rss', url: 'https://example.com/feed.xml', title: 'Example Blog' },
    now,
  ));
  const xEntry = unwrap(FeedEntry.collect({
    feedSourceId: xSource.aggregateState.feedSourceId,
    guid: '1234567890',
    url: 'https://x.com/secret_user/status/1234567890',
    title: 'tweet body text',
    description: 'tweet description text',
    publishedAt: now,
    hatenaBookmarkCount: null,
  }, now));
  const forbidden = ['secret_user', '1234567890', 'tweet body text', 'tweet description text'];

  const expectNothingLeaked = (redacted: ArchivedDomainEvent) => {
    expect(redacted).toMatchObject({ aggregateState: null, eventPayload: null });
    expect(JSON.stringify(redacted)).not.toContain('x.com');
    for (const word of forbidden) expect(JSON.stringify(redacted)).not.toContain(word);
  };

  it('x_user の情報源のイベントは state と payload を NULL にする', async () => {
    const events = [
      xSource,
      FeedSource.recordFetched(xSource.aggregateState, { etag: null, lastModified: null }, now),
      FeedSource.recordFetchFailed(xSource.aggregateState, 'failed @secret_user', now),
      FeedSource.setEnabled(xSource.aggregateState, false, now),
    ];

    for (const domainEvent of events) {
      expectNothingLeaked(await redact(archived(domainEvent)));
    }
  });

  it('x_user 以外の情報源のイベントは今までどおり state と payload を残す', async () => {
    const events = [
      rssSource,
      FeedSource.recordFetched(rssSource.aggregateState, { etag: 'e', lastModified: null }, now),
      FeedSource.recordFetchFailed(rssSource.aggregateState, 'timeout', now),
      FeedSource.setEnabled(rssSource.aggregateState, false, now),
    ];

    for (const domainEvent of events) {
      const plain = archived(domainEvent);
      expect(await redact(plain)).toEqual(plain);
    }
  });

  it('kind を読めない情報源のイベントは state と payload を NULL にする', async () => {
    const base = archived(FeedSource.setEnabled(rssSource.aggregateState, false, now));

    for (const aggregateState of [null, 'not json', '{"title":"x"}', '{"kind":1}']) {
      expect(await redact({ ...base, aggregateState })).toMatchObject({ aggregateState: null, eventPayload: null });
    }
  });

  it('feedEntry の collected / embedded / bookmarkCountUpdated は RSS の分も state と payload を NULL にする', async () => {
    const rssEntry = unwrap(FeedEntry.collect({
      feedSourceId: rssSource.aggregateState.feedSourceId,
      guid: 'rss-guid',
      url: 'https://example.com/post',
      title: 'rss title',
      description: 'rss description',
      publishedAt: now,
      hatenaBookmarkCount: null,
    }, now));
    const embedded = (entry: typeof xEntry) =>
      unwrap(FeedEntry.embed(entry.aggregateState, new Float32Array(EMBEDDING_DIMENSIONS), now));
    const events = [
      xEntry,
      embedded(xEntry),
      FeedEntry.updateBookmarkCount(xEntry.aggregateState, 3, now),
      rssEntry,
      embedded(rssEntry),
      FeedEntry.updateBookmarkCount(rssEntry.aggregateState, 3, now),
    ];

    for (const domainEvent of events) {
      expectNothingLeaked(await redact(archived(domainEvent)));
    }
  });

  it('feedEntry.expired は feedEntryId だけを持つのでそのまま残す', async () => {
    const expired = archived(FeedEntry.expire(xEntry.aggregateState, now));

    expect(await redact(expired)).toEqual(expired);
    for (const word of forbidden) expect(JSON.stringify(expired)).not.toContain(word);
  });
});

describe('DomainEventArchive.redact の report イベント', () => {
  it('report.reportSubmitted は REDACTED に入っていて、comment を state と payload に残さない', async () => {
    const now = Instant.orThrow(Date.UTC(2026, 9, 20));
    const submitted = Report.submit({
      userId: UserId.generate(),
      targetActorId: ActorId.generate(),
      statusIds: [PostId.generate()],
      category: 'offensive',
      comment: 'secret-report-comment',
      forwarded: true,
    }, now);
    if (!submitted.ok) throw new Error('unexpected err');
    const row = { ...toD1DomainEventRow(submitted.val), occurredAt: now };

    const redacted = await DomainEventArchive.redact(sha256Hex)(row);

    expect((ARCHIVE_REDACTED_EVENT_NAMES as readonly string[]).includes('report.reportSubmitted')).toBe(true);
    expect((ARCHIVE_PLAIN_EVENT_NAMES as readonly string[]).includes('report.reportSubmitted')).toBe(false);
    expect(redacted).toMatchObject({ aggregateState: null, eventPayload: null });
    expect(JSON.stringify(redacted)).not.toContain('secret-report-comment');
  });
});
