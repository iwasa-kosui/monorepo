import { describe, expect, it } from 'vitest';

import { lessonFile, whoCancelledSql } from './snapshots';

describe('whoCancelledSql', () => {
  it('who-cancelled.ts の SELECT を、字下げを除いて切り出す', () => {
    const sql = whoCancelledSql();
    expect(sql.startsWith('SELECT\n  visits.id,')).toBe(true);
    expect(sql).toContain('LEFT JOIN business_events');
    expect(sql.endsWith('ORDER BY visits.id')).toBe(true);
  });
});

describe('lessonFile', () => {
  it('教材のスクリプトを返し、無い名前はエラーにする', () => {
    expect(Object.keys(lessonFile('fail-record.ts'))).toEqual(['fail-record.ts']);
    expect(() => lessonFile('missing.ts')).toThrow('教材のスクリプトが見つかりません');
  });
});
