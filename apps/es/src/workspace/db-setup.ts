import type { DbSetup, TableInfo } from './scenario';

export type ResolvedDbSetup =
  | { readonly kind: 'sql'; readonly sql: string; readonly tables: readonly TableInfo[] }
  | {
    readonly kind: 'script';
    readonly setup: Extract<DbSetup, { kind: 'script' }>;
    readonly tables: readonly TableInfo[];
  };

const sqlLiteral = (value: string): string => `'${value.replaceAll(`'`, `''`)}'`;

const columnsOf = (definition: string): TableInfo['columns'] =>
  definition.split('\n').slice(1, -1).map((line) => {
    const match = /^\s*(\w+)\s+(\w+)/.exec(line);
    if (match === null) {
      throw new Error(`テーブルの列の定義を読めません: ${line}`);
    }
    return { name: match[1] ?? '', type: match[2] ?? '' };
  });

export const tablesOfSql = (sql: string): TableInfo[] =>
  [...sql.matchAll(/CREATE TABLE (\w+) \([\s\S]*?\n\s*\);/g)].map((match) => ({
    name: match[1] ?? '',
    columns: columnsOf(match[0]),
  }));

export const resolveDbSetup = (
  setup: DbSetup,
  readSnapshotFile: (snapshot: string, file: string) => string,
): ResolvedDbSetup => {
  if (setup.kind === 'script') {
    return { kind: 'script', setup, tables: setup.tables };
  }
  if (setup.kind === 'sql') {
    return { kind: 'sql', sql: setup.sql, tables: tablesOfSql(setup.sql) };
  }
  const create = new RegExp(`CREATE TABLE ${setup.table} \\([\\s\\S]*?\\n\\s*\\);`).exec(
    readSnapshotFile(setup.snapshot, setup.file),
  )?.[0];
  if (create === undefined) {
    throw new Error(`${setup.file} から ${setup.table} の CREATE TABLE 文を切り出せません`);
  }
  const values = setup.rows.map((row) => `  (${row.map(sqlLiteral).join(', ')})`).join(',\n');
  const sql = `${create}\nINSERT INTO ${setup.table} (${setup.columns.join(', ')}) VALUES\n${values};`;
  return { kind: 'sql', sql, tables: tablesOfSql(create) };
};
