import type { Database, SqlJsStatic, SqlValue, Statement } from 'sql.js';

import type { SqlCell, SqlRunOutcome, SqlStatementResult } from './types.ts';

export const maxDisplayedRows = 1000;

const leadingKeyword = (sql: string): string => {
  const stripped = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, '');
  return /^[A-Za-z]+/.exec(stripped)?.[0]?.toLowerCase() ?? '';
};

const toCell = (value: SqlValue): SqlCell => {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  if (value instanceof Uint8Array) {
    return `(BLOB ${value.length} バイト)`;
  }
  return String(value);
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const runStatement = (database: Database, statement: Statement): SqlStatementResult => {
  const sql = statement.getSQL().trim();
  const columns = statement.getColumnNames();
  if (columns.length > 0) {
    const rows: SqlCell[][] = [];
    let totalRows = 0;
    while (statement.step()) {
      totalRows += 1;
      if (rows.length < maxDisplayedRows) {
        rows.push(statement.get().map(toCell));
      }
    }
    return { kind: 'rows', sql, columns, rows, totalRows };
  }
  statement.step();
  const keyword = leadingKeyword(sql);
  if (['insert', 'update', 'delete', 'replace', 'with'].includes(keyword)) {
    return { kind: 'changes', sql, changes: database.getRowsModified() };
  }
  return { kind: 'done', sql };
};

export const createSqlSession = (SQL: SqlJsStatic) => {
  let database = new SQL.Database();

  const reset = (setupSql: string): string | null => {
    database.close();
    database = new SQL.Database();
    try {
      database.run('PRAGMA foreign_keys = ON');
      database.run(setupSql);
      return null;
    } catch (error) {
      return messageOf(error);
    }
  };

  const adopt = (next: Database): void => {
    database.close();
    database = next;
  };

  const run = (sql: string): SqlRunOutcome => {
    const results: SqlStatementResult[] = [];
    let currentSql: string | null = null;
    const iterator = database.iterateStatements(sql);
    try {
      for (const statement of iterator) {
        currentSql = statement.getSQL().trim();
        results.push(runStatement(database, statement));
        currentSql = null;
      }
      return { results, error: null };
    } catch (error) {
      const failedSql = currentSql ?? iterator.getRemainingSQL().trim();
      return { results, error: { sql: failedSql === '' ? null : failedSql, message: messageOf(error) } };
    }
  };

  return { reset, adopt, run };
};
