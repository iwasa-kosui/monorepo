import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { createDatabase } from './db.ts';
import {
  cancelVisit,
  completeVisit,
  explainCancellationCount,
  reserveVisit,
  verifyCancellationCount,
} from './visits.ts';

const visitId = 'visit-1';
const visitDate = '2026-04-01';
const cancelInput = { visitId, reason: '飼い主の都合', operatedBy: '受付スタッフ' };
const missingEvent =
  `来院キャンセルの記録がありません（business_events を target_type = 'Visit'、target_id = '${visitId}' で探しました）`;

let db: DatabaseSync;

const statusOf = (id: string) => db.prepare(`SELECT status FROM visits WHERE id = ?`).get(id)?.status;
const eventsOf = (id: string) =>
  db.prepare(`SELECT * FROM business_events WHERE target_type = 'Visit' AND target_id = ?`).all(id);
const cancelledCountOf = (date: string) =>
  db.prepare(`SELECT cancelled_count FROM daily_cancellation_counts WHERE visit_date = ?`).get(date)?.cancelled_count;

beforeEach(() => {
  db = createDatabase();
  reserveVisit(db, { visitId, petName: 'ポチ', visitDate });
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
});

describe('第2章 ステップ1', () => {
  it('来院をキャンセルすると、来院キャンセルの記録が1行残る', () => {
    cancelVisit(db, cancelInput);
    const events = eventsOf(visitId);
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
    assert.throws(() => cancelVisit(db, cancelInput), /記録に失敗しました/, '記録の失敗が更新処理に伝わっていません');
    assert.equal(statusOf(visitId), 'reserved');
  });
});

describe('第2章 ステップ2', () => {
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

describe('キャンセル数の集計', () => {
  it('キャンセルすると、その診察日のキャンセル数が1増える', () => {
    cancelVisit(db, cancelInput);
    assert.equal(cancelledCountOf(visitDate), 1);
    reserveVisit(db, { visitId: 'visit-2', petName: 'タマ', visitDate });
    cancelVisit(db, { ...cancelInput, visitId: 'visit-2' });
    assert.equal(cancelledCountOf(visitDate), 2);
  });

  it('キャンセル数の更新に失敗したら、来院のキャンセルも記録も残らない', () => {
    db.exec(`
      CREATE TRIGGER reject_count BEFORE INSERT ON daily_cancellation_counts
      BEGIN
        SELECT RAISE(ABORT, 'キャンセル数の更新に失敗しました');
      END;
    `);
    assert.throws(() => cancelVisit(db, cancelInput), /キャンセル数の更新に失敗しました/);
    assert.equal(statusOf(visitId), 'reserved');
    assert.equal(eventsOf(visitId).length, 0);
  });
});

describe('第4章 集計テーブル', () => {
  it('キャンセル数の内訳を、業務イベントから理由と操作者つきで答えられる', () => {
    reserveVisit(db, { visitId: 'visit-2', petName: 'タマ', visitDate });
    cancelVisit(db, cancelInput);
    cancelVisit(db, { visitId: 'visit-2', reason: '来院前に回復したため', operatedBy: '院長' });
    const breakdown = explainCancellationCount(db, visitDate);
    assert.equal(breakdown.length, 2);
    assert.equal(breakdown[0]?.visitId, 'visit-1');
    assert.equal(breakdown[0]?.reason, '飼い主の都合');
    assert.equal(breakdown[0]?.operatedBy, '受付スタッフ');
    assert.equal(breakdown[1]?.visitId, 'visit-2');
    assert.equal(breakdown[1]?.reason, '来院前に回復したため');
    assert.equal(breakdown[1]?.operatedBy, '院長');
    assert.ok(breakdown.every((row) => !Number.isNaN(Date.parse(row.eventAt))), 'キャンセルした時刻を答えられません');
    assert.ok(breakdown.every((row, index) => index === 0 || row.eventId > (breakdown[index - 1]?.eventId ?? 0)));
  });

  it('別の診察日のキャンセルは内訳に含まれない', () => {
    reserveVisit(db, { visitId: 'visit-2', petName: 'タマ', visitDate: '2026-04-02' });
    cancelVisit(db, cancelInput);
    cancelVisit(db, { ...cancelInput, visitId: 'visit-2' });
    assert.deepEqual(explainCancellationCount(db, visitDate).map((row) => row.visitId), ['visit-1']);
    assert.deepEqual(explainCancellationCount(db, '2026-04-02').map((row) => row.visitId), ['visit-2']);
  });

  it('業務イベントからの再計算が、キャンセル数と一致する', () => {
    reserveVisit(db, { visitId: 'visit-2', petName: 'タマ', visitDate });
    cancelVisit(db, cancelInput);
    cancelVisit(db, { ...cancelInput, visitId: 'visit-2' });
    assert.deepEqual(verifyCancellationCount(db, visitDate), {
      recordedCount: 2,
      recalculatedCount: 2,
      difference: 0,
    });
  });

  it('業務イベントを通らずに書き換えたキャンセル数は、検算で差として分かる', () => {
    cancelVisit(db, cancelInput);
    db.prepare(`UPDATE daily_cancellation_counts SET cancelled_count = 5 WHERE visit_date = ?`).run(visitDate);
    assert.deepEqual(verifyCancellationCount(db, visitDate), {
      recordedCount: 5,
      recalculatedCount: 1,
      difference: 4,
    });
  });

  it('イベントの導入前から残っているキャンセル数は、検算で差として分かる', () => {
    db.prepare(`INSERT INTO daily_cancellation_counts (visit_date, cancelled_count) VALUES (?, 1)`).run(visitDate);
    cancelVisit(db, cancelInput);
    assert.deepEqual(verifyCancellationCount(db, visitDate), {
      recordedCount: 2,
      recalculatedCount: 1,
      difference: 1,
    });
  });
});
