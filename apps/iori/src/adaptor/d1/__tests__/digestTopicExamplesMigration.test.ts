import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const target = '0025_';

const setup = () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const run = (predicate: (name: string) => boolean) => {
    for (const file of files.filter(predicate)) sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  };
  run((name) => name < target);
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run('user-1', 'kosui');
  const insertLegacyTopic = (topicKey: string) =>
    sqlite.prepare(
      'INSERT INTO digest_topics(userId,topicKey,name,description,embedding,embeddedAt,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run('user-1', topicKey, 'name', 'description', new Uint8Array(4096), 1_500, 0, 1, 1_000, 1_000);
  return { sqlite, insertLegacyTopic, applyTarget: () => run((name) => name >= target) };
};

describe('digest_topics の examples、excludes、excludeEmbedding の migration', () => {
  it('適用前から有る行は examples と excludes が空の配列になり、excludeEmbedding は null で、embedding と embeddedAt は変わらない', () => {
    const { sqlite, insertLegacyTopic, applyTarget } = setup();
    insertLegacyTopic('genai');

    applyTarget();

    expect(
      sqlite.prepare(
        'SELECT topicKey, examples, excludes, excludeEmbedding, embeddedAt, length(embedding) AS bytes FROM digest_topics',
      ).all(),
    ).toEqual([
      { topicKey: 'genai', examples: '[]', excludes: '[]', excludeEmbedding: null, embeddedAt: 1_500, bytes: 4096 },
    ]);
  });

  it('適用後に新しい列を省いて insert すると、examples と excludes が空の配列になる', () => {
    const { sqlite, applyTarget } = setup();
    applyTarget();

    sqlite.prepare(
      'INSERT INTO digest_topics(userId,topicKey,name,description,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run('user-1', 'platform', 'name', 'description', 0, 1, 1_000, 1_000);

    expect(sqlite.prepare('SELECT examples, excludes, excludeEmbedding FROM digest_topics').all()).toEqual([
      { examples: '[]', excludes: '[]', excludeEmbedding: null },
    ]);
  });
});
