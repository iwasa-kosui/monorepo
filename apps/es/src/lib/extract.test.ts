import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  blankLabelsOf,
  blankValuesOf,
  extractBlock,
  extractExport,
  extractFrom,
  extractHtmlSection,
  extractLines,
  insertTemplates,
  tableBodyRows,
  toInsertTemplate,
} from './extract';
import { cancelVisitOf, readFunctionsOf } from './snapshots';

const read = (path: string): string => readFileSync(new URL(`../../exercises/${path}`, import.meta.url), 'utf8');

describe('extractExport', () => {
  it('実ソースから関数全体を切り出す', () => {
    const code = extractExport(read('chapter-2-step-1/visits.ts'), 'cancelVisit');
    expect(code.startsWith('export const cancelVisit =')).toBe(true);
    expect(code.endsWith('};')).toBe(true);
    expect(code).toContain('INSERT INTO visit_cancellations');
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

describe('extractFrom', () => {
  it('開始行からソースの末尾までを返し、末尾の空白を落とす', () => {
    expect(extractFrom('a\nb\nc\n\n', 'b')).toBe('b\nc');
  });

  it('開始行が無ければビルドを止める', () => {
    expect(() => extractFrom('a\nb', 'z')).toThrow('開始行');
  });
});

describe('extractHtmlSection', () => {
  const html = '<p>前文</p><h2 id="a">甲</h2><p>1</p><h2 id="b">乙</h2><p>2</p>';

  it('見出しから次の見出しの手前までを返す', () => {
    expect(extractHtmlSection(html, '甲')).toBe('<h2 id="a">甲</h2><p>1</p>');
  });

  it('最後の節は末尾までを返す', () => {
    expect(extractHtmlSection(html, '乙')).toBe('<h2 id="b">乙</h2><p>2</p>');
  });

  it('見出しが無ければビルドを止める', () => {
    expect(() => extractHtmlSection(html, '丙')).toThrow('切り出す節が見つかりません');
  });
});

describe('cancelVisitOf', () => {
  it('集計テーブルの更新処理は開始と完成で同じ', () => {
    expect(cancelVisitOf('chapter-4-summary-table-start')).toBe(cancelVisitOf('chapter-4-summary-table-done'));
  });
});

describe('readFunctionsOf', () => {
  it.each([
    ['chapter-4-summary-table-done', 'explainCancellationCount', [
      'explainCancellationCount',
      'verifyCancellationCount',
    ]],
    ['chapter-4-external-sync-done', 'findImportRecords', ['findImportRecords', 'findUnappliedImports']],
    ['chapter-4-audit-log-done', 'explainChange', ['explainChange', 'findChangesWithoutReason']],
  ])('%s の読み取り関数を切り出す', (snapshot, first, names) => {
    const code = readFunctionsOf(snapshot, first);
    expect(code).not.toContain('第4章で実装します');
    for (const name of names) {
      expect(code).toContain(name);
    }
  });
});

describe('tableBodyRows', () => {
  const table =
    '<table><thead><tr><th>軸</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>';

  it('表の本体の行を順に返す', () => {
    expect(tableBodyRows(table)).toEqual(['<tr><td>1</td></tr>', '<tr><td>2</td></tr>']);
  });

  it('表の本体が無ければビルドを止める', () => {
    expect(() => tableBodyRows('<p>表なし</p>')).toThrow('表の本体');
  });
});

describe('toInsertTemplate', () => {
  it.each(
    [
      ['step1', 'chapter-2-step-1', 2],
      ['step2', 'chapter-2-step-2', 3],
    ] as const,
  )('%s の空欄を埋めると %s の解答に戻る', (name, snapshot, count) => {
    const source = read(`${snapshot}/visits.ts`);
    const template = insertTemplates[name];
    const labels = blankLabelsOf(template);
    const values = blankValuesOf(template);
    const filled = labels.reduce(
      (text, label, index) => text.replace(label, values[index] ?? ''),
      toInsertTemplate(source, template),
    );
    expect(labels).toHaveLength(count);
    expect(source).toContain(filled);
  });

  it('ステップ1の雛形は、呼び出し元が渡す2つを空欄にし、来院の ID と時刻を残す', () => {
    const template = toInsertTemplate(read('chapter-2-step-1/visits.ts'), insertTemplates.step1);
    expect(blankLabelsOf(insertTemplates.step1)).toEqual(['/* 誰が */', '/* なぜ */']);
    expect(template.startsWith('    db.prepare(`\n      INSERT INTO visit_cancellations')).toBe(true);
    expect(template).toContain('input.visitId,');
    expect(template).toContain('new Date().toISOString(),');
    expect(template).not.toContain('input.operatedBy');
    expect(template).not.toContain('input.reason');
  });

  it('ステップ2の雛形は、ステップ1から引き継ぐ値と変化後の状態を残し、まとめるときに変わる3つを空欄にする', () => {
    const template = toInsertTemplate(read('chapter-2-step-2/visits.ts'), insertTemplates.step2);
    expect(blankLabelsOf(insertTemplates.step2)).toEqual(['/* event_name */', '/* payload */', '/* target_type */']);
    expect(template).toContain('new Date().toISOString(),');
    expect(template).toContain('input.visitId,');
    expect(template).toContain('JSON.stringify(cancelled),');
    expect(template).not.toContain('VisitCancelled');
    expect(template).not.toContain('operatedBy');
    expect(template).not.toContain(`'Visit'`);
  });

  it('雛形にする行が解答に無ければビルドを止める', () => {
    expect(() => toInsertTemplate(read('chapter-1-start/visits.ts'), insertTemplates.step1)).toThrow('開始行');
  });
});

describe('extractBlock', () => {
  it('行の全体が一致する開始行から、その後の終了行までを返す', () => {
    expect(extractBlock('  a(\na(\n  b\n);\nc\n);', 'a(', ');')).toBe('a(\n  b\n);');
  });
});
