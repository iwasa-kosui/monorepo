const timestampColumns = new Set([
  'acceptedAt',
  'createdAt',
  'deletedAt',
  'expires',
  'occurredAt',
  'publishedAt',
  'receivedAt',
  'unpublishedAt',
]);

const jsonColumnsByTable = new Map([
  ['domain_events', new Set(['aggregateId', 'aggregateState', 'eventPayload'])],
  ['posts', new Set(['metadata'])],
]);

const stableJson = (value) => {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value;
};

const stableJsonString = (value) => JSON.stringify(stableJson(value));

const timestampMillis = (value) => {
  if (typeof value === 'number') return value;
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) throw new Error('Export contains an invalid timestamp.');
  return milliseconds;
};

export const d1ColumnForSourceColumn = (_table, column) => column;

export const normalizeD1Value = ({ table, column, value }) => {
  if (value === null) return null;
  if (timestampColumns.has(column)) return timestampMillis(value);
  if (jsonColumnsByTable.get(table)?.has(column) && typeof value === 'string') {
    try {
      return stableJsonString(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (typeof value === 'object') return stableJsonString(value);
  return value;
};

/**
 * Returns the canonical D1 representation of one source row. Column names,
 * transformed values, and nested JSON keys are stable across PostgreSQL and D1.
 */
export const canonicalD1Row = (table, row) =>
  Object.fromEntries(
    Object.keys(row).sort().map((column) => [
      d1ColumnForSourceColumn(table, column),
      normalizeD1Value({ table, column, value: row[column] }),
    ]),
  );

export const canonicalD1RowString = (table, row) => JSON.stringify(canonicalD1Row(table, row));

export const compareCanonicalD1Rows = (table, left, right) => {
  const leftString = canonicalD1RowString(table, left);
  const rightString = canonicalD1RowString(table, right);
  return leftString < rightString ? -1 : leftString > rightString ? 1 : 0;
};

export const canonicalD1TableRows = (table, rows) => rows.map((row) => canonicalD1RowString(table, row)).sort();
