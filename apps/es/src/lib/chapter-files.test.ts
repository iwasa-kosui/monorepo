import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { schedule } from '../schedule';
import { chapterNames, chapterPageFiles, readChapterText } from './chapter-files';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('章のページ', () => {
  it('schedule の章と同じ章のディレクトリがある', () => {
    expect(chapterNames()).toEqual(schedule.map((row) => row.id).sort());
  });

  it('ページのファイル名は 01 からの連番である', () => {
    for (const chapter of chapterNames()) {
      const expected = chapterPageFiles(chapter).map((_, index) => `${String(index + 1).padStart(2, '0')}.mdx`);
      expect(chapterPageFiles(chapter)).toEqual(expected);
    }
  });

  it('goal は章の最初のページだけにある', () => {
    for (const chapter of chapterNames()) {
      const goals = chapterPageFiles(chapter).map((file) =>
        read(`src/content/chapters/${chapter}/${file}`).startsWith('---\ngoal: ')
      );
      expect(goals).toEqual(goals.map((_, index) => index === 0));
    }
  });
});

describe('immersive のページ', () => {
  const immersiveFiles = (): string[] =>
    chapterNames().flatMap((chapter) =>
      chapterPageFiles(chapter)
        .filter((file) => /^immersive: true$/m.test(read(`src/content/chapters/${chapter}/${file}`)))
        .map((file) => `${chapter}/${file}`)
    );

  const expected = [
    'intro/02.mdx',
    ...chapterNames().filter((chapter) => chapter !== 'intro').flatMap((chapter) =>
      chapterPageFiles(chapter).map((file) => `${chapter}/${file}`)
    ),
  ].sort();

  it('immersive は導入の 2 ページ目と、第1章から第4章とまとめの全ページに付き、wide も残っている', () => {
    expect(immersiveFiles().sort()).toEqual(expected);
    for (const file of expected) {
      expect(read(`src/content/chapters/${file}`), file).toMatch(/^wide: true$/m);
    }
  });

  it('見た目から隠す本文の見出しは、読み上げに残る', () => {
    const source = read('src/content/chapters/intro/02.mdx');
    expect(source).toMatch(/<div class="visually-hidden">\n\n## .+\n\n.+\n\n<\/div>\n\n<InvestigationScene \/>/);
  });

  it('第1章から第4章とまとめのページは、最初の見出しが h2 なら、隠した見出しとして作業環境の前に置く', () => {
    for (const file of expected.filter((name) => !name.startsWith('intro/'))) {
      const source = read(`src/content/chapters/${file}`);
      const first = /^(#{2,3}) .+$/m.exec(source);
      if (first?.[1] !== '##') continue;
      expect(source, file).toMatch(/<div class="visually-hidden">\n\n## .+\n\n<\/div>\n\n<Workspace /);
      expect(source.indexOf(first[0]), file).toBeLessThan(source.indexOf('<Workspace '));
    }
  });

  it('作業環境を置くページは、Workspace を1つだけ持つ', () => {
    for (const file of expected.filter((name) => !name.startsWith('intro/'))) {
      expect(read(`src/content/chapters/${file}`).match(/<Workspace /g), file).toHaveLength(1);
    }
  });
});

describe('導入の文面', () => {
  it('導入は 7 ページに分かれている', () => {
    expect(chapterPageFiles('intro')).toHaveLength(7);
  });

  it('分けたページをつないだ本文が、承認済みの導入と 1 文字も違わない', () => {
    expect(readChapterText('intro')).toBe(read('fixtures/intro.approved.mdx'));
  });
});
