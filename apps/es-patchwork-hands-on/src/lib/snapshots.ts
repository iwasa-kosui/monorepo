import { extractExport, extractFrom, extractLines, toInsertTemplate } from './extract';

const sources = import.meta.glob<string>('/exercises/chapter-*/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const lessons = import.meta.glob<string>('/lessons/*.ts', {
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

export const readFunctionsOf = (snapshot: string, firstFunction: string): string =>
  extractFrom(readSnapshot(snapshot, 'visits.ts'), `export const ${firstFunction} =`);

export const insertTemplate = (): string => toInsertTemplate(readSnapshot('chapter-2-step-1', 'visits.ts'));

export const whoCancelledQuery = (): string =>
  extractLines(readSnapshot('chapter-2-step-2', 'who-cancelled.ts'), 'const rows =', '`).all();');

export const snapshotFiles = (snapshot: string): Record<string, string> => {
  const prefix = `/exercises/${snapshot}/`;
  const files = Object.entries(sources)
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, source]): [string, string] => [path.slice(prefix.length), source]);
  if (files.length === 0) {
    throw new Error(`スナップショットが見つかりません: ${snapshot}`);
  }
  return Object.fromEntries(files);
};

export const lessonFile = (name: string): Record<string, string> => {
  const source = lessons[`/lessons/${name}`];
  if (source === undefined) {
    throw new Error(`教材のスクリプトが見つかりません: ${name}`);
  }
  return { [name]: source };
};

export const whoCancelledSql = (): string => {
  const source = readSnapshot('chapter-2-step-2', 'who-cancelled.ts');
  const body = /db\.prepare\(`([\s\S]*?)`\)\.all\(\)/.exec(source)?.[1];
  if (body === undefined) {
    throw new Error('who-cancelled.ts から SQL を切り出せません');
  }
  const lines = body.split('\n').filter((line) => line.trim() !== '');
  const indent = Math.min(...lines.map((line) => /^ */.exec(line)?.[0].length ?? 0));
  return lines.map((line) => line.slice(indent)).join('\n');
};
