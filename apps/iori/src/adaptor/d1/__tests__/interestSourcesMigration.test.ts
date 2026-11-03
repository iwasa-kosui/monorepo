import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const user = createMastodonSeed(fixture).addLocalActor('kosui');
  const insertSource = (
    interestSourceId: string,
    kind: string,
    ref: string,
    userId: string = user.userId,
    embedding: Uint8Array | null = null,
  ) =>
    fixture.sqlite.prepare(
      'INSERT INTO interest_sources(interestSourceId,userId,kind,ref,contentHash,weight,occurredAt,embedding,embeddedAt,deletedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(interestSourceId, userId, kind, ref, 'h', 1.0, 1_000, embedding, null, null, 2_000, 2_000);
  return { fixture, user, insertSource };
};

describe('interest_sources migration', () => {
  it('embedding と embeddedAt と deletedAt を NULL にして insert できる', () => {
    const { fixture, insertSource } = setup();

    insertSource('s-1', 'kosui_post', 'https://example.com/a');

    expect(
      fixture.sqlite.prepare('SELECT interestSourceId, embedding, embeddedAt, deletedAt FROM interest_sources').all(),
    )
      .toEqual([{ interestSourceId: 's-1', embedding: null, embeddedAt: null, deletedAt: null }]);
  });

  it('同じ (userId, kind, ref) は一意制約で拒否し、kind か ref が違えば入れられる', () => {
    const { insertSource } = setup();
    insertSource('s-1', 'kosui_post', 'https://example.com/a');

    expect(() => insertSource('s-2', 'kosui_post', 'https://example.com/a')).toThrow(/UNIQUE/);
    expect(() => insertSource('s-3', 'kosui_talk', 'https://example.com/a')).not.toThrow();
    expect(() => insertSource('s-4', 'kosui_post', 'https://example.com/b')).not.toThrow();
  });

  it('存在しない user の行は外部キーで拒否する', () => {
    const { insertSource } = setup();

    expect(() => insertSource('s-1', 'kosui_post', 'https://example.com/a', 'missing')).toThrow(/FOREIGN KEY/);
  });

  it('4096 バイトの BLOB をそのまま読み戻せる', () => {
    const { fixture, insertSource } = setup();
    const bytes = Uint8Array.from({ length: 4096 }, (_, index) => index % 256);
    insertSource('s-1', 'kosui_post', 'https://example.com/a', undefined, bytes);

    const [row] = fixture.sqlite.prepare('SELECT embedding FROM interest_sources').all() as Array<
      { embedding: Uint8Array }
    >;

    expect(row?.embedding).toBeInstanceOf(Uint8Array);
    expect(Array.from(row!.embedding)).toEqual(Array.from(bytes));
  });

  it('未埋め込みかつ未削除の行を引く索引がある', () => {
    const { fixture } = setup();

    const plan = fixture.sqlite.prepare(
      'EXPLAIN QUERY PLAN SELECT interestSourceId FROM interest_sources WHERE userId = \'u\' AND embeddedAt IS NULL AND deletedAt IS NULL',
    ).all() as Array<{ detail: string }>;

    expect(plan.map((row) => row.detail).join('\n')).toContain('interest_sources_user_id_embedded_at_deleted_at_idx');
  });
});
