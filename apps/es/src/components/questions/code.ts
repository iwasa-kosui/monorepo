export const storeRecording = `const create = (db: DatabaseSync): SqliteVisitCancelledStore => ({
  store: (event) => {
    db.prepare(\`UPDATE visits SET status = ? WHERE id = ?\`).run(event.targetState.status, event.targetId);
    db.prepare(\`
      INSERT INTO business_events (event_at, event_name, payload, target_id, target_type, target_state)
      VALUES (?, ?, ?, ?, ?, ?)
    \`).run(...BusinessEventRow.from(event));
  },
});`;

export const storeWithdrawn = `const create = (db: DatabaseSync): SqliteVisitCancelledStore => ({
  store: (event) => {
    db.prepare(\`UPDATE visits SET status = ? WHERE id = ?\`).run(event.targetState.status, event.targetId);
  },
});`;

export const smallStartWithdrawn =
  `export const cancelVisit = (db: DatabaseSync, input: { visitId: string; reason: string; operatedBy: string }): void => {
  withTransaction(db, () => {
    const visit = db.prepare(\`SELECT status FROM visits WHERE id = ?\`).get(input.visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    if (visit.status === 'completed') {
      throw new Error('診察が終わった来院はキャンセルできません');
    }
    db.prepare(\`UPDATE visits SET status = 'cancelled' WHERE id = ?\`).run(input.visitId);
  });
};`;
