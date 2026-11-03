import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { interestSourcesTable, usersTable } from '../src/adaptor/d1/schema.ts';
import { EMBEDDING_DIMENSIONS } from '../src/domain/interestSource/embedding.ts';

describe('interest_sources の BLOB（miniflare の D1）', () => {
  it('embedding を書いて読み戻すと元の Float32 値に一致する', async () => {
    const db = createD1Db(env.DB);
    const userId = crypto.randomUUID();
    const interestSourceId = crypto.randomUUID();
    const embedding = Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.sin(i) * 3.5);
    await db.insert(usersTable).values({ userId, username: `blob-${userId}` });
    await db.insert(interestSourcesTable).values({
      interestSourceId,
      userId,
      kind: 'kosui_post',
      ref: 'https://example.com/blob',
      contentHash: 'a'.repeat(64),
      weight: 1.0,
      occurredAt: new Date(1_000),
      embedding,
      embeddedAt: new Date(2_000),
      createdAt: new Date(1_000),
      updatedAt: new Date(1_000),
    });

    const [row] = await db.select({ embedding: interestSourcesTable.embedding }).from(interestSourcesTable)
      .where(eq(interestSourcesTable.interestSourceId, interestSourceId));
    const rawRow = await env.DB.prepare(
      'SELECT embedding, length(embedding) AS bytes FROM interest_sources WHERE interestSourceId = ?',
    )
      .bind(interestSourceId).first<{ embedding: unknown; bytes: number }>();
    const rawRowAll = await env.DB.prepare('SELECT embedding FROM interest_sources WHERE interestSourceId = ?')
      .bind(interestSourceId).raw<[unknown]>();
    console.log(
      `D1 BLOB: first() -> ${Object.prototype.toString.call(rawRow?.embedding)}, raw() -> ${
        Object.prototype.toString.call(rawRowAll[0]?.[0])
      }, stored bytes ${rawRow?.bytes}`,
    );

    expect(Array.isArray(rawRow?.embedding)).toBe(true);
    expect(rawRow?.bytes).toBe(EMBEDDING_DIMENSIONS * 4);
    expect(row?.embedding).toBeInstanceOf(Float32Array);
    expect(Array.from(row!.embedding!)).toEqual(Array.from(embedding));
  });
});
