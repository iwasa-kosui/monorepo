import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { schedule } from './schedule';

const root = fileURLToPath(new URL('../', import.meta.url));

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const listFiles = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : listFiles(path);
    }
    return [path];
  });

const participantFiles = [
  ...['src/pages', 'src/content', 'src/components', 'src/layouts', 'exercises'].flatMap(listFiles),
  'src/schedule.ts',
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
      'src/pages/index.mdx',
      'src/pages/setup.astro',
    ]);
  });

  it('index.mdx と setup.astro では、イベントソーシングを含む行がすべて「もう他人ごとじゃないイベントソーシング」を含む', () => {
    for (const path of ['src/pages/index.mdx', 'src/pages/setup.astro']) {
      const lines = read(path).split('\n').filter((line) => line.includes('イベントソーシング'));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toContain('もう他人ごとじゃないイベントソーシング');
      }
    }
  });

  it('intro.mdx では「今日の題材」より後にイベントソーシングが出ない', () => {
    const intro = read('src/content/chapters/intro.mdx');
    const heading = intro.indexOf('## 今日の題材');
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(intro.slice(heading)).not.toContain('イベントソーシング');
  });

  it('intro.mdx と chapter-1.mdx に業務イベント、business_events、target_ が出ない', () => {
    for (const path of ['src/content/chapters/intro.mdx', 'src/content/chapters/chapter-1.mdx']) {
      const text = read(path);
      for (const word of ['業務イベント', 'business_events', 'target_']) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('chapter-2.mdx の業務イベントは定義が先に出て、business_events はその後に出る', () => {
    const text = read('src/content/chapters/chapter-2.mdx');
    const first = text.indexOf('業務イベント');
    expect(first).toBeGreaterThanOrEqual(0);
    const lineStart = text.lastIndexOf('\n', first) + 1;
    const lineEnd = text.indexOf('\n', first);
    expect(text.slice(lineStart, lineEnd)).toMatch(/^業務イベントは、業務で起きた/);
    const heading = text.indexOf('### 更新処理の中で記録する');
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(first).toBeGreaterThan(heading);
    expect(text.indexOf('business_events')).toBeGreaterThan(lineEnd);
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
        '他人ごと',
        '二択',
      ]
    ) {
      expect(intro).toContain(text);
    }
  });

  it('index.mdx に講師の画面を見るだけで追える旨が書かれている', () => {
    expect(read('src/pages/index.mdx')).toContain('講師の画面を見るだけで追えます');
  });

  it('chapter-1.mdx に show-visits.ts の実行コマンドが書かれている', () => {
    expect(read('src/content/chapters/chapter-1.mdx')).toContain('node show-visits.ts');
  });

  it('chapter-2.mdx の変更量の表記が実物の差分と合う', () => {
    expect(read('src/content/chapters/chapter-2.mdx')).toContain(changeSize());
  });

  it('第4章の判断表に判断の問いと運用コストが書かれている', () => {
    const table = read('exercises/chapter-4-decision-table.md');
    expect(table).toContain('何を部分的に活用し、何を記録しないか');
    expect(table).toContain('運用コスト');
  });

  it('summary.mdx に足さなくて構いません、変更理由、組み立て直す設計が書かれている', () => {
    const summary = read('src/content/chapters/summary.mdx');
    expect(count(summary, '足さなくて構いません')).toBe(1);
    expect(summary).toContain('変更理由');
    expect(summary).toContain('組み立て直す設計');
  });

  it('講師の台本に 0:35 と、遅れたときの判断表の手順が書かれている', () => {
    const script = read('docs/instructor-script.md');
    expect(script).toContain('0:35');
    const start = script.indexOf('## 遅れたときの手順');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = script.indexOf('\n## ', start + 1);
    expect(script.slice(start, end)).toContain('判断表で3つのパターンを比べて1つ選ぶ');
  });
});
