import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { createDatabase } from './db.ts';
import { cancelVisit, completeVisit, reserveVisit } from './visits.ts';

const visitId = 'visit-1';
const cancelInput = { visitId, reason: '飼い主の都合', operatedBy: '受付スタッフ' };

let db: DatabaseSync;

const statusOf = (id: string) => db.prepare(`SELECT status FROM visits WHERE id = ?`).get(id)?.status;
const eventsOf = (id: string) =>
  db.prepare(`SELECT * FROM domain_events WHERE aggregate_name = 'Visit' AND aggregate_id = ?`).all(id);

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
});

describe('第2章 ステップ1', () => {
  it('来院をキャンセルすると、来院キャンセルの記録が1行残る', () => {
    cancelVisit(db, cancelInput);
    const events = eventsOf(visitId);
    assert.equal(events.length, 1, 'domain_events に来院キャンセルの記録がありません');
    assert.equal(events[0]?.event_name, 'VisitCancelled');
  });

  it('キャンセルの記録に、キャンセル後の来院の状態が残る', () => {
    cancelVisit(db, cancelInput);
    const event = eventsOf(visitId)[0];
    assert.ok(event, 'domain_events に来院キャンセルの記録がありません');
    assert.equal(JSON.parse(String(event.aggregate_props)).status, 'cancelled');
  });

  it('記録に失敗したら、来院のキャンセルも失敗する', () => {
    db.exec(`
      CREATE TRIGGER reject_event BEFORE INSERT ON domain_events
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
      FROM domain_events
      WHERE aggregate_name = 'Visit' AND aggregate_id = ?
    `).get(visitId);
    assert.ok(answer, 'この来院がキャンセルになった記録がありません');
    assert.equal(answer.operated_by, cancelInput.operatedBy, 'キャンセルした人を答えられません');
    assert.equal(answer.reason, cancelInput.reason, 'キャンセルの理由を答えられません');
    assert.equal(answer.event_name, 'VisitCancelled');
    assert.ok(!Number.isNaN(Date.parse(String(answer.event_at))), 'キャンセルした時刻を答えられません');
  });
});
