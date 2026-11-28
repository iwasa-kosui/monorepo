export const storeRecording = `const storeVisitCancelled = (db: DatabaseSync, event: VisitCancelled): void => {
  db.prepare(\`UPDATE visits SET status = ? WHERE id = ?\`).run(event.targetState.status, event.targetId);
  db.prepare(\`
    INSERT INTO business_events (event_at, event_name, payload, target_id, target_type, target_state)
    VALUES (?, ?, ?, ?, ?, ?)
  \`).run(
    event.eventAt.toISOString(),
    event.eventName,
    JSON.stringify(event.payload),
    event.targetId,
    'Visit',
    JSON.stringify(event.targetState),
  );
};`;

export const storeWithdrawn = `const storeVisitCancelled = (db: DatabaseSync, event: VisitCancelled): void => {
  db.prepare(\`UPDATE visits SET status = ? WHERE id = ?\`).run(event.targetState.status, event.targetId);
};`;

const eventCenteredHead = `type Visit = Readonly<{
  id: string;
  pet_name: string;
  status: 'reserved' | 'checked_in' | 'completed' | 'cancelled';
}>;

type VisitCancelled = Readonly<{
  eventAt: Date;
  eventName: 'VisitCancelled';
  payload: Readonly<{ reason: string; operatedBy: string }>;
  targetId: Visit['id'];
  targetState: Visit;
}>;

const cancelVisit = (
  visit: Visit,
  input: Readonly<{ reason: string; operatedBy: string }>,
  now: Date,
): VisitCancelled => {
  if (visit.status === 'completed') {
    throw new Error('診察が終わった来院はキャンセルできません');
  }
  return {
    eventAt: now,
    eventName: 'VisitCancelled',
    payload: { reason: input.reason, operatedBy: input.operatedBy },
    targetId: visit.id,
    targetState: { ...visit, status: 'cancelled' },
  };
};

const resolveVisit = (db: DatabaseSync, visitId: string): Visit => {
  const visit = db.prepare(\`SELECT * FROM visits WHERE id = ?\`).get(visitId);
  if (visit === undefined) {
    throw new Error('来院が見つかりません');
  }
  return visit as Visit;
};`;

const eventCenteredTail = `const cancelVisitUseCase = (
  db: DatabaseSync,
  input: Readonly<{ visitId: string; reason: string; operatedBy: string }>,
): void => {
  withTransaction(db, () => {
    const visit = resolveVisit(db, input.visitId);
    const event = cancelVisit(visit, input, new Date());
    storeVisitCancelled(db, event);
  });
};`;

export const eventCenteredCode = [eventCenteredHead, storeRecording, eventCenteredTail].join('\n\n');

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
