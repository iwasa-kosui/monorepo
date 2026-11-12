import { describe, expect, it } from 'vitest';

import { PostId } from '../../../domain/post/postId.ts';
import { createD1PostVersionsResolverByPostId } from '../post/postVersionsResolverByPostId.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const postId = PostId.generate();
  const insert = (
    eventName: 'post.created' | 'post.updated',
    values: { aggregateState?: unknown; eventPayload?: unknown },
    occurredAt: number,
  ) =>
    fixture.sqlite.prepare(
      `INSERT INTO domain_events (eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt)
       VALUES (?, ?, 'post', ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      postId,
      values.aggregateState === undefined ? null : JSON.stringify(values.aggregateState),
      eventName,
      values.eventPayload === undefined ? null : JSON.stringify(values.eventPayload),
      occurredAt,
    );
  const resolve = () => createD1PostVersionsResolverByPostId(fixture.db).resolve(postId);
  return { fixture, postId, insert, resolve };
};

const update = (content: string, editedAt: number) => ({
  eventPayload: { content, summary: null, sensitive: false, editedAt },
});

describe('createD1PostVersionsResolverByPostId', () => {
  it('summary と sensitive の無い古い post.created を、summary は null、sensitive は false として読む', async () => {
    const t = setup();
    t.insert('post.created', { aggregateState: { content: '<p>old</p>', createdAt: 1_000 } }, 1_000);
    t.insert('post.updated', update('<p>new</p>', 2_000), 2_000);

    const result = await t.resolve();

    expect(result).toEqual({
      ok: true,
      val: [
        { content: '<p>old</p>', summary: null, sensitive: false, createdAt: 1_000 },
        { content: '<p>new</p>', summary: null, sensitive: false, createdAt: 2_000 },
      ],
    });
  });

  it('読めない行を飛ばし、読める版だけを古い順に返す', async () => {
    const t = setup();
    t.insert('post.created', {
      aggregateState: { content: '<p>v1</p>', summary: 'cw', sensitive: true, createdAt: 1_000 },
    }, 1_000);
    t.insert('post.updated', update('<p>v3</p>', 3_000), 3_000);
    t.insert('post.updated', { eventPayload: { content: 42 } }, 2_500);
    t.insert('post.updated', update('<p>v2</p>', 2_000), 2_000);
    t.fixture.sqlite.prepare(
      `INSERT INTO domain_events (eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt)
       VALUES (?, ?, 'post', NULL, 'post.updated', '{broken', 2_600)`,
    ).run(crypto.randomUUID(), t.postId);

    const result = await t.resolve();

    expect(result.ok && result.val.map(({ content }) => content)).toEqual(['<p>v1</p>', '<p>v2</p>', '<p>v3</p>']);
    expect(result.ok && result.val[0]).toEqual({
      content: '<p>v1</p>',
      summary: 'cw',
      sensitive: true,
      createdAt: 1_000,
    });
  });

  it('post.created が読めないときは、ほかの版だけで組み立てる', async () => {
    const t = setup();
    t.insert('post.created', { aggregateState: { summary: null } }, 1_000);
    t.insert('post.updated', update('<p>v2</p>', 2_000), 2_000);

    const result = await t.resolve();

    expect(result).toEqual({
      ok: true,
      val: [{ content: '<p>v2</p>', summary: null, sensitive: false, createdAt: 2_000 }],
    });
  });

  it('読める版が無ければ空にする', async () => {
    const t = setup();
    t.insert('post.created', { aggregateState: { summary: null } }, 1_000);

    expect(await t.resolve()).toEqual({ ok: true, val: [] });
  });
});
