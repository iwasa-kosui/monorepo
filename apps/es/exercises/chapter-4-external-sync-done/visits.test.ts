import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { createDatabase } from './db.ts';
import {
  cancelVisit,
  checkInVisit,
  completeVisit,
  type ExternalCancellationMessage,
  findImportRecords,
  findUnappliedImports,
  importExternalCancellation,
  reserveVisit,
} from './visits.ts';

const visitId = 'visit-1';
const cancelInput = { visitId, reason: '飼い主の都合', operatedBy: '受付スタッフ' };
const message: ExternalCancellationMessage = {
  visitId,
  operatedAt: '2026-11-20T09:00:00.000Z',
  reason: '飼い主の都合',
};
const missingEvent =
  `来院キャンセルの記録がありません（business_events を target_type = 'Visit'、target_id = '${visitId}' で探しました）`;
const missingImport = '取り込みの記録がありません（business_events の ExternalCancellationReceived を探しました）';

let db: DatabaseSync;

const statusOf = (id: string) => db.prepare(`SELECT status FROM visits WHERE id = ?`).get(id)?.status;
const eventsOf = (id: string) =>
  db.prepare(`SELECT * FROM business_events WHERE target_type = 'Visit' AND target_id = ?`).all(id);

beforeEach(() => {
  db = createDatabase();
  reserveVisit(db, { visitId, petName: 'ポチ' });
});

describe('既存の業務', () => {
  it('予約した来院をキャンセルすると、来院の状態がキャンセルになる', () => {
    cancelVisit(db, cancelInput);
    assert.equal(statusOf(visitId), 'cancelled');
  });

  it('診察が終わった来院はキャンセルできない', () => {
    completeVisit(db, { visitId });
    assert.throws(() => cancelVisit(db, cancelInput), /キャンセルできません/);
    assert.equal(statusOf(visitId), 'completed');
  });

  it('キャンセルできなかったときは、記録を残さない', () => {
    completeVisit(db, { visitId });
    assert.throws(() => cancelVisit(db, cancelInput));
    assert.equal(eventsOf(visitId).length, 0);
  });

  it('来院の更新に失敗したら、記録も残らない', () => {
    db.exec(`
      CREATE TRIGGER reject_update BEFORE UPDATE ON visits
      BEGIN
        SELECT RAISE(ABORT, '更新に失敗しました');
      END;
    `);
    assert.throws(() => cancelVisit(db, cancelInput), /更新に失敗しました/);
    assert.equal(eventsOf(visitId).length, 0);
  });

  it('予約した来院を受け付けると、来院の状態が受付済みになる', () => {
    checkInVisit(db, { visitId });
    assert.equal(statusOf(visitId), 'checked_in');
  });
});

describe('第2章 ステップ2', () => {
  it('来院をキャンセルすると、来院キャンセルの記録が1行残る', () => {
    cancelVisit(db, cancelInput);
    const events = eventsOf(visitId).filter((event) => event.event_name === 'VisitCancelled');
    assert.equal(events.length, 1, missingEvent);
    assert.equal(events[0]?.event_name, 'VisitCancelled');
  });

  it('キャンセルの記録に、キャンセル後の来院の状態が残る', () => {
    cancelVisit(db, cancelInput);
    const event = eventsOf(visitId)[0];
    assert.ok(event, missingEvent);
    assert.equal(JSON.parse(String(event.target_state)).status, 'cancelled');
  });

  it('記録に失敗したら、来院のキャンセルも失敗する', () => {
    db.exec(`
      CREATE TRIGGER reject_event BEFORE INSERT ON business_events
      BEGIN
        SELECT RAISE(ABORT, '記録に失敗しました');
      END;
    `);
    assert.throws(
      () => cancelVisit(db, cancelInput),
      /記録に失敗しました/,
      '記録の失敗が更新処理に伝わっていません',
    );
    assert.equal(statusOf(visitId), 'reserved');
  });

  it('キャンセルした人と理由を答えられる', () => {
    cancelVisit(db, cancelInput);
    const answer = db.prepare(`
      SELECT
        event_at,
        event_name,
        payload ->> '$.operatedBy' AS operated_by,
        payload ->> '$.reason' AS reason
      FROM business_events
      WHERE target_type = 'Visit' AND target_id = ?
    `).get(visitId);
    assert.ok(answer, missingEvent);
    assert.equal(
      answer.operated_by,
      cancelInput.operatedBy,
      'キャンセルした人を答えられません（payload の operatedBy を読みました）',
    );
    assert.equal(
      answer.reason,
      cancelInput.reason,
      'キャンセルの理由を答えられません（payload の reason を読みました）',
    );
    assert.equal(answer.event_name, 'VisitCancelled');
    assert.ok(!Number.isNaN(Date.parse(String(answer.event_at))), 'キャンセルした時刻を答えられません');
  });
});

describe('予約サイトからの取り込み', () => {
  it('予約サイトのキャンセルが届くと、来院の状態がキャンセルになる', () => {
    importExternalCancellation(db, message);
    assert.equal(statusOf(visitId), 'cancelled');
  });

  it('取り込んだキャンセルは、飼い主が入力した理由つきで来院キャンセルの記録に残る', () => {
    importExternalCancellation(db, message);
    const events = eventsOf(visitId).filter((event) => event.event_name === 'VisitCancelled');
    assert.equal(events.length, 1, missingEvent);
    const payload = JSON.parse(String(events[0]?.payload));
    assert.equal(payload.reason, message.reason);
    assert.equal(payload.operatedBy, '予約サイト');
  });

  it('診察が終わった来院は、予約サイトのキャンセルが届いても状態が変わらない', () => {
    completeVisit(db, { visitId });
    importExternalCancellation(db, message);
    assert.equal(statusOf(visitId), 'completed');
    assert.equal(eventsOf(visitId).filter((event) => event.event_name === 'VisitCancelled').length, 0);
  });
});

describe('第4章 予約サイトからの取り込みの記録', () => {
  it('取り込んだキャンセルは、届いた内容と時刻を、取り込んだ結果と一緒に答えられる', () => {
    importExternalCancellation(db, message);
    const records = findImportRecords(db);
    assert.equal(records.length, 1);
    const record = records[0];
    assert.ok(record, missingImport);
    assert.equal(record.visitId, visitId);
    assert.equal(record.petName, 'ポチ');
    assert.equal(record.operatedAt, message.operatedAt);
    assert.equal(record.cancelReason, message.reason);
    assert.equal(record.result, 'applied');
    assert.equal(record.reason, null);
    assert.ok(!Number.isNaN(Date.parse(record.receivedAt)), '届いた時刻を答えられません');
  });

  it('取り込まなかったキャンセルは、取り込まなかった理由が記録に残る', () => {
    completeVisit(db, { visitId });
    importExternalCancellation(db, message);
    const record = findImportRecords(db)[0];
    assert.ok(record, missingImport);
    assert.equal(record.result, 'rejected');
    assert.equal(record.reason, '診察が終わった来院はキャンセルできません');
    assert.equal(record.operatedAt, message.operatedAt);
    assert.equal(record.cancelReason, message.reason);
    assert.deepEqual(findUnappliedImports(db).map((unapplied) => unapplied.visitId), [visitId]);
  });

  it('届いた内容を記録できなければ、来院のキャンセルも取り込まない', () => {
    db.exec(`
      CREATE TRIGGER reject_received BEFORE INSERT ON business_events
      WHEN NEW.event_name = 'ExternalCancellationReceived'
      BEGIN
        SELECT RAISE(ABORT, '届いた内容の記録に失敗しました');
      END;
    `);
    assert.throws(() => importExternalCancellation(db, message), /届いた内容の記録に失敗しました/);
    assert.equal(statusOf(visitId), 'reserved');
    assert.equal(eventsOf(visitId).length, 0);
  });

  it('取り込まなかった結果を記録できなければ、届いた内容の記録も残らない', () => {
    completeVisit(db, { visitId });
    db.exec(`
      CREATE TRIGGER reject_rejected BEFORE INSERT ON business_events
      WHEN NEW.event_name = 'ExternalCancellationRejected'
      BEGIN
        SELECT RAISE(ABORT, '取り込まなかった結果の記録に失敗しました');
      END;
    `);
    assert.throws(() => importExternalCancellation(db, message), /取り込まなかった結果の記録に失敗しました/);
    assert.equal(eventsOf(visitId).length, 0);
  });
});
