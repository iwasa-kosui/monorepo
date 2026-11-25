import { DatabaseSync } from 'node:sqlite';

export const createDatabase = (): DatabaseSync => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE visits (
      id TEXT PRIMARY KEY,
      pet_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('reserved', 'checked_in', 'completed', 'cancelled'))
    );
    CREATE TABLE visit_cancellations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id TEXT NOT NULL,
      cancelled_at TEXT NOT NULL,
      operated_by TEXT NOT NULL,
      reason TEXT NOT NULL
    );
  `);
  return db;
};

export const withTransaction = <T>(db: DatabaseSync, run: () => T): T => {
  db.exec(`BEGIN`);
  try {
    const result = run();
    db.exec(`COMMIT`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK`);
    throw error;
  }
};
