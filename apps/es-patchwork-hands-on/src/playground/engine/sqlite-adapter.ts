import type { BindParams, Database, SqlJsStatic, SqlValue, Statement } from 'sql.js';

type Row = Record<string, SqlValue>;
type RunResult = { changes: number; lastInsertRowid: number };

const namedPattern = /[:$@][A-Za-z_][A-Za-z0-9_]*/g;

const toSqlValue = (value: unknown, position: number): SqlValue => {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError(`Provided value cannot be bound to SQLite parameter ${position}.`);
};

const isNamedParameters = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);

const bindParams = (sql: string, params: readonly unknown[]): BindParams => {
  const [first] = params;
  if (isNamedParameters(first)) {
    const bound: Record<string, SqlValue> = {};
    for (const name of new Set(sql.match(namedPattern) ?? [])) {
      const bare = name.slice(1);
      const key = name in first ? name : bare in first ? bare : undefined;
      if (key !== undefined) {
        bound[name] = toSqlValue(first[key], 1);
      }
    }
    return bound;
  }
  return params.map((value, index) => toSqlValue(value, index + 1));
};

const toRow = (statement: Statement): Row => {
  const row: Row = Object.create(null);
  const names = statement.getColumnNames();
  const values = statement.get();
  names.forEach((name, index) => {
    row[name] = values[index] ?? null;
  });
  return row;
};

export type StatementSync = {
  run: (...params: unknown[]) => RunResult;
  get: (...params: unknown[]) => Row | undefined;
  all: (...params: unknown[]) => Row[];
  iterate: (...params: unknown[]) => IterableIterator<Row>;
};

export type DatabaseSyncInstance = {
  exec: (sql: string) => void;
  prepare: (sql: string) => StatementSync;
  close: () => void;
};

export const createDatabaseSync = (SQL: SqlJsStatic) => {
  const opened = new Set<Database>();

  class DatabaseSync implements DatabaseSyncInstance {
    raw: Database;

    constructor(_path?: unknown, _options?: unknown) {
      this.raw = new SQL.Database();
      this.raw.run('PRAGMA foreign_keys = ON');
      opened.add(this.raw);
    }

    exec(sql: string): void {
      this.raw.run(sql);
    }

    prepare(sql: string): StatementSync {
      const raw = this.raw;
      const withStatement = <T>(params: readonly unknown[], use: (statement: Statement) => T): T => {
        const statement = raw.prepare(sql);
        try {
          statement.bind(bindParams(sql, params));
          return use(statement);
        } finally {
          statement.free();
        }
      };
      const all = (...params: unknown[]): Row[] =>
        withStatement(params, (statement) => {
          const rows: Row[] = [];
          while (statement.step()) {
            rows.push(toRow(statement));
          }
          return rows;
        });
      return {
        run: (...params) =>
          withStatement(params, (statement) => {
            statement.step();
            const lastInsertRowid = raw.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0];
            return { changes: raw.getRowsModified(), lastInsertRowid: Number(lastInsertRowid ?? 0) };
          }),
        get: (...params) => withStatement(params, (statement) => (statement.step() ? toRow(statement) : undefined)),
        all,
        iterate: (...params) => all(...params)[Symbol.iterator](),
      };
    }

    close(): void {
      if (opened.delete(this.raw)) {
        this.raw.close();
      }
    }
  }

  return {
    DatabaseSync,
    closeAll: (): void => {
      for (const database of opened) {
        database.close();
      }
      opened.clear();
    },
  };
};
