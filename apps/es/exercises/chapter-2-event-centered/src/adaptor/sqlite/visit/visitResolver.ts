import type { DatabaseSync } from 'node:sqlite';
import type { Visit, VisitResolver } from '../../../domain/visit/visit.ts';

export const createSqliteVisitResolver = (db: DatabaseSync): VisitResolver => ({
  resolve: (visitId) => {
    const visit = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    return visit as Visit;
  },
});
