import type { DatabaseSync } from 'node:sqlite';
import type { Visit, VisitResolver } from '../../../domain/visit/visit.ts';

export type SqliteVisitResolver = VisitResolver;

const create = (db: DatabaseSync): SqliteVisitResolver => ({
  resolve: (visitId) => {
    const visit = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    return visit as Visit;
  },
});

export const SqliteVisitResolver = { create } as const;
