import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { createDatabase } from './db.ts';
import { cancelVisit, checkInVisit, completeVisit, reserveVisit } from './visits.ts';

const visitId = 'visit-1';
const cancelInput = { visitId, reason: '飼い主の都合', operatedBy: '受付スタッフ' };
const secondCancelInput = { visitId, reason: '来院前に回復したため', operatedBy: '院長' };
const missingRecord = `来院キャンセルの記録がありません（visit_cancellations を visit_id = '${visitId}' で探しました）`;

let db: DatabaseSync;

const statusOf = (id: string) => db.prepare(`SELECT status FROM visits WHERE id = ?`).get(id)?.status;
const cancellationsOf = (id: string) =>
  db.prepare(`SELECT * FROM visit_cancellations WHERE visit_id = ? ORDER BY id`).all(id);

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
    assert.equal(cancellationsOf(visitId).length, 0);
  });

  it('来院の更新に失敗したら、記録も残らない', () => {
    db.exec(`
      CREATE TRIGGER reject_update BEFORE UPDATE ON visits
      BEGIN
        SELECT RAISE(ABORT, '更新に失敗しました');
      END;
    `);
    assert.throws(() => cancelVisit(db, cancelInput), /更新に失敗しました/);
    assert.equal(cancellationsOf(visitId).length, 0);
  });

  it('予約した来院を受け付けると、来院の状態が受付済みになる', () => {
    checkInVisit(db, { visitId });
    assert.equal(statusOf(visitId), 'checked_in');
  });
});

describe('第2章 ステップ1', () => {
  it('来院をキャンセルすると、来院キャンセルの記録が1行残る', () => {
    cancelVisit(db, cancelInput);
    assert.equal(cancellationsOf(visitId).length, 1, missingRecord);
  });

  it('キャンセルした人と理由を答えられる', () => {
    cancelVisit(db, cancelInput);
    const record = cancellationsOf(visitId)[0];
    assert.ok(record, missingRecord);
    assert.equal(
      record.operated_by,
      cancelInput.operatedBy,
      'キャンセルした人を答えられません（operated_by を読みました）',
    );
    assert.equal(record.reason, cancelInput.reason, 'キャンセルの理由を答えられません（reason を読みました）');
    assert.ok(
      !Number.isNaN(Date.parse(String(record.cancelled_at))),
      'キャンセルした時刻を答えられません（cancelled_at を読みました）',
    );
  });

  it('同じ来院をもう一度キャンセルしても、前の記録は消えない', () => {
    cancelVisit(db, cancelInput);
    cancelVisit(db, secondCancelInput);
    assert.deepEqual(
      cancellationsOf(visitId).map((record) => record.reason),
      [cancelInput.reason, secondCancelInput.reason],
      '2回のキャンセルの理由が、2行で残っていません（reason を読みました）',
    );
  });

  it('記録に失敗したら、来院のキャンセルも失敗する', () => {
    db.exec(`
      CREATE TRIGGER reject_record BEFORE INSERT ON visit_cancellations
      BEGIN
        SELECT RAISE(ABORT, '記録に失敗しました');
      END;
    `);
    assert.throws(() => cancelVisit(db, cancelInput), /記録に失敗しました/, '記録の失敗が更新処理に伝わっていません');
    assert.equal(statusOf(visitId), 'reserved');
  });
});
