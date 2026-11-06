import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { extractExport, extractLines, toInsertTemplate } from './extract';

const read = (path: string): string => readFileSync(new URL(`../../exercises/${path}`, import.meta.url), 'utf8');

describe('extractExport', () => {
  it('実ソースから関数全体を切り出す', () => {
    const code = extractExport(read('chapter-2-step-1/visits.ts'), 'cancelVisit');
    expect(code.startsWith('export const cancelVisit =')).toBe(true);
    expect(code.endsWith('};')).toBe(true);
    expect(code).toContain(`'VisitCancelled'`);
    expect(code).not.toContain('reserveVisit');
  });

  it('関数が無ければビルドを止める', () => {
    expect(() => extractExport(read('chapter-1-start/visits.ts'), 'noSuchFunction')).toThrow('開始行');
  });
});

describe('extractLines', () => {
  it('終了行が無ければビルドを止める', () => {
    expect(() => extractLines('a\nb', 'a', 'z')).toThrow('終了行');
  });

  it('第3章の SELECT を切り出せる', () => {
    const code = extractLines(read('chapter-2-step-2/who-cancelled.ts'), 'const rows =', '`).all();');
    expect(code).toContain(`payload ->> '$.operatedBy'`);
    expect(code).toContain(`payload ->> '$.reason'`);
  });
});

describe('toInsertTemplate', () => {
  it('空欄を埋めるとステップ1の解答に戻る', () => {
    const source = read('chapter-2-step-1/visits.ts');
    const filled = toInsertTemplate(source)
      .replace('/* event_name */', `'VisitCancelled'`)
      .replace('/* aggregate_id */', 'input.visitId')
      .replace('/* aggregate_name */', `'Visit'`)
      .replace('/* aggregate_props */', 'JSON.stringify(cancelled)');
    expect(source).toContain(filled);
  });

  it('雛形に解答の値を残さない', () => {
    const template = toInsertTemplate(read('chapter-2-step-1/visits.ts'));
    expect(template).not.toContain('VisitCancelled');
    expect(template).toContain('JSON.stringify({})');
  });
});
