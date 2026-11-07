import { DatabaseSync } from 'node:sqlite';

export const createDatabase = (): DatabaseSync => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE visits (
      id TEXT PRIMARY KEY,
      pet_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('reserved', 'checked_in', 'completed', 'cancelled')),
      visit_date TEXT NOT NULL
    );
    CREATE TABLE business_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_at TEXT NOT NULL,
      event_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_state TEXT NOT NULL
    );
    CREATE TABLE daily_cancellation_counts (
      visit_date TEXT PRIMARY KEY,
      cancelled_count INTEGER NOT NULL
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
