export type ChapterPage<T> = {
  readonly entry: T;
  readonly chapter: string;
  readonly number: number;
  readonly total: number;
  readonly slug: string;
};

export const chapterOfEntryId = (id: string): string => id.split('/')[0] ?? id;

export const pagePath = (chapter: string, number: number): string =>
  number === 1 ? `/chapters/${chapter}/` : `/chapters/${chapter}/${number}/`;

export const buildChapterPages = <T extends { readonly id: string }>(
  entries: readonly T[],
  chapterOrder: readonly string[],
): readonly ChapterPage<T>[] => {
  const unknown = entries.map((entry) => chapterOfEntryId(entry.id)).filter((chapter) =>
    !chapterOrder.includes(chapter)
  );
  if (unknown.length > 0) {
    throw new Error(`schedule.ts に無い章のディレクトリがあります: ${[...new Set(unknown)].join(', ')}`);
  }
  return chapterOrder.flatMap((chapter) => {
    const sorted = entries
      .filter((entry) => chapterOfEntryId(entry.id) === chapter)
      .toSorted((a, b) => a.id.localeCompare(b.id));
    return sorted.map((entry, index) => ({
      entry,
      chapter,
      number: index + 1,
      total: sorted.length,
      slug: index === 0 ? chapter : `${chapter}/${index + 1}`,
    }));
  });
};
