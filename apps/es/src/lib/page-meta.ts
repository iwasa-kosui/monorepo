import { getCollection } from 'astro:content';

import { schedule } from '../schedule';
import { buildChapterPages } from './chapter-routes';

const chapterPathPattern = /^\/chapters\/([^/]+)(?:\/|$)/;

export const chapterGoalOf = async (pathname: string): Promise<string | undefined> => {
  const chapter = chapterPathPattern.exec(pathname)?.[1];
  if (chapter === undefined) {
    return undefined;
  }
  const pages = buildChapterPages(
    await getCollection('chapters'),
    schedule.map((row) => row.id),
  );
  return pages.find((page) => page.chapter === chapter && page.number === 1)?.entry.data.goal;
};
