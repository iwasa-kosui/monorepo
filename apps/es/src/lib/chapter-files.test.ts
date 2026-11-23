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

describe('導入の文面', () => {
  it('導入は 3 ページに分かれている', () => {
    expect(chapterPageFiles('intro')).toHaveLength(3);
  });

  it('分けたページをつないだ本文が、承認済みの導入と 1 文字も違わない', () => {
    expect(readChapterText('intro')).toBe(read('fixtures/intro.approved.mdx'));
  });
});
