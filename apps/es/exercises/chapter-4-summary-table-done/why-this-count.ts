import { createDatabase } from './db.ts';
import { cancelVisit, explainCancellationCount, reserveVisit, verifyCancellationCount } from './visits.ts';

const visitDate = '2026-04-01';
const db = createDatabase();
db.prepare(`INSERT INTO daily_cancellation_counts (visit_date, cancelled_count) VALUES (?, 1)`).run(visitDate);

reserveVisit(db, { visitId: 'visit-1', petName: 'ポチ', visitDate });
reserveVisit(db, { visitId: 'visit-2', petName: 'タマ', visitDate });
cancelVisit(db, { visitId: 'visit-1', reason: '飼い主の都合', operatedBy: '受付スタッフ' });
cancelVisit(db, { visitId: 'visit-2', reason: '来院前に回復したため', operatedBy: '院長' });

console.table(explainCancellationCount(db, visitDate));
console.table([verifyCancellationCount(db, visitDate)]);
