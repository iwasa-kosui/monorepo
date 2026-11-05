import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { FeedSource, FeedSourceAlreadyExistsError, FeedSourceNotFoundError } from './feedSource.ts';
import { FeedSourceId } from './feedSourceId.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 5));
const later = Instant.orThrow(now + 5_000);

describe('FeedSource.parseNew', () => {
  it('kind が rss で https の URL と 1〜100 文字の title を受け付ける', () => {
    expect(FeedSource.parseNew({ kind: 'rss', url: 'https://example.com/feed.xml', title: 'あ'.repeat(100) }).ok)
      .toBe(true);
    expect(FeedSource.parseNew({ kind: 'rss', url: 'https://example.com/feed.xml', title: 'a' }).ok).toBe(true);
  });

  it('http の URL も受け付ける', () => {
    expect(FeedSource.parseNew({ kind: 'rss', url: 'http://example.com/feed.xml', title: 'ブログ' }).ok).toBe(true);
  });

  it.each(['hatena_hotentry', 'hatena_entrylist', 'thoughtworks_radar', 'atom'])(
    'kind が %s なら受け付けない',
    (kind) => {
      expect(FeedSource.parseNew({ kind, url: 'https://example.com/feed.xml', title: 'ブログ' }).ok).toBe(false);
    },
  );

  it.each([
    'ftp://example.com/feed.xml',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'example.com/feed.xml',
    '',
  ])('URL が %s なら受け付けない', (url) => {
    expect(FeedSource.parseNew({ kind: 'rss', url, title: 'ブログ' }).ok).toBe(false);
  });

  it('title が空、または 101 文字なら受け付けない', () => {
    expect(FeedSource.parseNew({ kind: 'rss', url: 'https://example.com/feed.xml', title: '' }).ok).toBe(false);
    expect(FeedSource.parseNew({ kind: 'rss', url: 'https://example.com/feed.xml', title: 'あ'.repeat(101) }).ok)
      .toBe(false);
  });
});

describe('FeedSource.setEnabled', () => {
  it('enabled だけを変えた feedSource.enabledChanged を返す', () => {
    const created = FeedSource.createFeedSource(
      { kind: 'rss', url: 'https://example.com/feed.xml', title: 'ブログ' },
      now,
    );
    if (!created.ok) throw new Error('create failed');
    const source = created.val.aggregateState;

    const changed = FeedSource.setEnabled(source, false, later);

    expect(changed).toMatchObject({
      aggregateName: 'feedSource',
      eventName: 'feedSource.enabledChanged',
      aggregateId: { feedSourceId: source.feedSourceId },
      aggregateState: { ...source, enabled: false },
      eventPayload: { feedSourceId: source.feedSourceId, enabled: false, changedAt: later },
    });
  });
});

describe('FeedSource のエラー', () => {
  it('FeedSourceNotFoundError は type と feedSourceId を持つ', () => {
    const feedSourceId = FeedSourceId.generate();

    expect(FeedSourceNotFoundError.create(feedSourceId)).toMatchObject({
      type: 'FeedSourceNotFoundError',
      detail: { feedSourceId },
    });
  });

  it('FeedSourceAlreadyExistsError は type と url を持つ', () => {
    expect(FeedSourceAlreadyExistsError.create('https://example.com/feed.xml')).toMatchObject({
      type: 'FeedSourceAlreadyExistsError',
      detail: { url: 'https://example.com/feed.xml' },
    });
  });
});
