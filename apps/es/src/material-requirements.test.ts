import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readChapterText } from './lib/chapter-files';
import { schedule } from './schedule';

const root = fileURLToPath(new URL('../', import.meta.url));

const chapterPagePath = /^src\/content\/chapters\/([^/]+)\/[^/]+\.mdx$/;
const chapterPath = /^src\/content\/chapters\/([^/]+)\.mdx$/;

const read = (path: string): string => {
  const chapter = chapterPath.exec(path)?.[1];
  return chapter === undefined
    ? readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    : readChapterText(chapter);
};

const listFiles = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : listFiles(path);
    }
    return [path];
  });

const participantFiles = [
  ...new Set([
    ...['src/pages', 'src/content', 'src/components', 'src/layouts', 'exercises'].flatMap(listFiles),
    'src/schedule.ts',
    'src/site.ts',
  ].map((path) => path.replace(chapterPagePath, 'src/content/chapters/$1.mdx'))),
];

const count = (text: string, word: string): number => text.split(word).length - 1;

const filesContaining = (word: string): string[] => participantFiles.filter((path) => read(path).includes(word)).sort();

const changeSize = (): string => {
  const result = spawnSync('git', [
    'diff',
    '--no-index',
    '--numstat',
    join(root, 'exercises/chapter-1-start/visits.ts'),
    join(root, 'exercises/chapter-2-step-2/visits.ts'),
  ], { encoding: 'utf8' });
  const [added, deleted] = result.stdout.split('\t');
  return `+${added}/-${deleted}`;
};

describe('PRD の受入条件', () => {
  it('参加者が読むファイルに DDD、ドメイン駆動、ドメインモデルが出ない', () => {
    for (const word of ['DDD', 'ドメイン駆動', 'ドメインモデル']) {
      expect(filesContaining(word)).toEqual([]);
    }
  });

  it('ドメインイベントは summary.mdx にだけ1回出る', () => {
    expect(filesContaining('ドメインイベント')).toEqual(['src/content/chapters/summary.mdx']);
    expect(count(read('src/content/chapters/summary.mdx'), 'ドメインイベント')).toBe(1);
  });

  it('関連記事の名前は summary.mdx にだけ出る', () => {
    for (const word of ['domain_events', 'aggregate_']) {
      expect(filesContaining(word)).toEqual(['src/content/chapters/summary.mdx']);
    }
  });

  it('イベントソーシングが出るファイルは決まった4つだけ', () => {
    expect(filesContaining('イベントソーシング')).toEqual([
      'src/content/chapters/intro.mdx',
      'src/content/chapters/summary.mdx',
      'src/pages/setup.astro',
      'src/site.ts',
    ]);
  });

  it('site.ts と setup.astro では、イベントソーシングを含む行がすべて「もう他人ごとじゃないイベントソーシング」を含む', () => {
    for (const path of ['src/site.ts', 'src/pages/setup.astro']) {
      const lines = read(path).split('\n').filter((line) => line.includes('イベントソーシング'));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toContain('もう他人ごとじゃないイベントソーシング');
      }
    }
  });

  it('intro.mdx と chapter-1.mdx に業務イベント、business_events、target_ が出ない', () => {
    for (const path of ['src/content/chapters/intro.mdx', 'src/content/chapters/chapter-1.mdx']) {
      const text = read(path);
      for (const word of ['業務イベント', 'business_events', 'target_']) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('chapter-2.mdx の業務イベントは、ステップ1の後の ADR で定義が先に出て、business_events はその後に出る', () => {
    const text = read('src/content/chapters/chapter-2.mdx');
    const first = text.indexOf('業務イベント');
    expect(first).toBeGreaterThanOrEqual(0);
    const lineStart = text.lastIndexOf('\n', first) + 1;
    const lineEnd = text.indexOf('\n', first);
    expect(text.slice(lineStart, lineEnd)).toMatch(/^業務イベントは、業務で起きた/);
    const stepOne = text.indexOf('<AddRecordScene step={1} />');
    expect(stepOne).toBeGreaterThanOrEqual(0);
    expect(first).toBeGreaterThan(stepOne);
    expect(text.indexOf('business_events')).toBeGreaterThan(lineEnd);
  });

  it('chapter-2.mdx の ADR の2ページは、状況、決定、結果の順に書く', () => {
    const text = read('src/content/chapters/chapter-2.mdx');
    const headings = [...text.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
    expect(headings.slice(0, 6)).toEqual(['状況', '決定', '結果', '状況', '決定', '結果']);
  });

  it('schedule の title に業務イベントが出ない', () => {
    for (const row of schedule) {
      expect(row.title).not.toContain('業務イベント');
    }
  });

  it('intro.mdx に導入の主張が書かれている', () => {
    const intro = read('src/content/chapters/intro.mdx');
    for (
      const text of [
        '最初からイベント中心に設計しなければ使えない',
        '考えることが多く、現実的ではない',
        '段階的に適用',
        '捨てたデータは復元できない',
        '過去の契約を見ないと、そのデータを何に使ってよいか判断できないこともあります。',
        '過去を説明できず苦しみました',
        '## このハンズオンの目的',
      ]
    ) {
      expect(intro).toContain(text);
    }
  });

  it('index.astro に講師の画面を見るだけで追える旨が書かれている', () => {
    expect(read('src/pages/index.astro')).toContain('講師の画面を見るだけで追えます');
  });

  it('intro/02.mdx に調査の画面が置かれている', () => {
    expect(read('src/content/chapters/intro/02.mdx')).toContain('<InvestigationScene />');
  });

  it('chapter-2.mdx の変更量の表記が実物の差分と合う', () => {
    expect(read('src/content/chapters/chapter-2.mdx')).toContain(changeSize());
  });

  it('第4章の判断表に判断の問いと導入後の作業が書かれている', () => {
    const table = read('exercises/chapter-4-decision-table.md');
    expect(table).toContain('業務イベントを何に使い、何を記録しないか');
    expect(table).toContain('導入した後に担当者とシステムが続ける作業');
  });

  it('summary.mdx に足さなくて構いません、変更理由、組み立て直す設計が書かれている', () => {
    const summary = read('src/content/chapters/summary.mdx');
    expect(count(summary, '足さなくて構いません')).toBe(1);
    expect(summary).toContain('変更理由');
    expect(summary).toContain('組み立て直す設計');
    expect(summary).toContain('捨てたデータは復元できません');
  });
});
