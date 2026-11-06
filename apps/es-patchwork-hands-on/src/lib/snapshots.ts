import { extractExport, extractLines, toInsertTemplate } from './extract';

const sources = import.meta.glob<string>('/exercises/chapter-*/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const readSnapshot = (snapshot: string, file: string): string => {
  const source = sources[`/exercises/${snapshot}/${file}`];
  if (source === undefined) {
    throw new Error(`スナップショットのファイルが見つかりません: ${snapshot}/${file}`);
  }
  return source;
};

export const cancelVisitOf = (snapshot: string): string =>
  extractExport(readSnapshot(snapshot, 'visits.ts'), 'cancelVisit');

export const insertTemplate = (): string => toInsertTemplate(readSnapshot('chapter-2-step-1', 'visits.ts'));

export const whoCancelledQuery = (): string =>
  extractLines(readSnapshot('chapter-2-step-2', 'who-cancelled.ts'), 'const rows =', '`).all();');
