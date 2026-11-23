import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { createDatabase } from './db.ts';
import { cancelVisit, completeVisit, explainChange, findChangesWithoutReason, reserveVisit } from './visits.ts';

const visitId = 'visit-1';
const cancelInput = { visitId, reason: '飼い主の都合', operatedBy: '受付スタッフ' };
const missingEvent =
  `来院キャンセルの記録がありません（business_events を target_type = 'Visit'、target_id = '${visitId}' で探しました）`;

let db: DatabaseSync;

const statusOf = (id: string) => db.prepare(`SELECT status FROM visits WHERE id = ?`).get(id)?.status;
const eventsOf = (id: string) =>
  db.prepare(`SELECT * FROM business_events WHERE target_type = 'Visit' AND target_id = ?`).all(id);
const auditLogsOf = (id: string) => db.prepare(`SELECT * FROM audit_logs WHERE row_id = ? ORDER BY id`).all(id);
const auditLogIdOf = (id: string) => Number(auditLogsOf(id)[0]?.id);

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
    completeVisit(db, { visitId, operatedBy: '獣医師' });
    assert.throws(() => cancelVisit(db, cancelInput), /キャンセルできません/);
    assert.equal(statusOf(visitId), 'completed');
  });

  it('キャンセルできなかったときは、記録を残さない', () => {
    completeVisit(db, { visitId, operatedBy: '獣医師' });
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

describe('監査ログ', () => {
  it('キャンセルすると、監査ログに変更前後の値と操作者が残る', () => {
    cancelVisit(db, cancelInput);
    const logs = auditLogsOf(visitId);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.table_name, 'visits');
    assert.equal(logs[0]?.column_name, 'status');
    assert.equal(logs[0]?.old_value, 'reserved');
    assert.equal(logs[0]?.new_value, 'cancelled');
    assert.equal(logs[0]?.operated_by, cancelInput.operatedBy);
  });

  it('診察を終えると、監査ログに変更前後の値と操作者が残る', () => {
    completeVisit(db, { visitId, operatedBy: '獣医師' });
    const logs = auditLogsOf(visitId);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.old_value, 'reserved');
    assert.equal(logs[0]?.new_value, 'completed');
    assert.equal(logs[0]?.operated_by, '獣医師');
  });

  it('監査ログの記録に失敗したら、来院のキャンセルも失敗する', () => {
    db.exec(`
      CREATE TRIGGER reject_audit_log BEFORE INSERT ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, '監査ログの記録に失敗しました');
      END;
    `);
    assert.throws(() => cancelVisit(db, cancelInput), /監査ログの記録に失敗しました/);
    assert.equal(statusOf(visitId), 'reserved');
    assert.equal(eventsOf(visitId).length, 0);
  });
});

describe('第4章 監査ログ', () => {
  it('監査ログの変更から、キャンセルの業務上の理由を答えられる', () => {
    cancelVisit(db, cancelInput);
    const change = explainChange(db, auditLogIdOf(visitId));
    assert.ok(change, '監査ログの変更が見つかりません（audit_logs を主にして探しました）');
    assert.equal(change.oldValue, 'reserved');
    assert.equal(change.newValue, 'cancelled');
    assert.equal(change.operatedBy, cancelInput.operatedBy);
    assert.ok(!Number.isNaN(Date.parse(change.operatedAt)), '変更した時刻を答えられません');
    assert.equal(change.eventName, 'VisitCancelled');
    assert.equal(change.reason, cancelInput.reason);
  });

  it('同じ変更でも、理由が違えば業務イベントで見分けられる', () => {
    reserveVisit(db, { visitId: 'visit-2', petName: 'タマ' });
    cancelVisit(db, cancelInput);
    cancelVisit(db, { visitId: 'visit-2', reason: '来院前に回復したため', operatedBy: cancelInput.operatedBy });
    const first = explainChange(db, auditLogIdOf(visitId));
    const second = explainChange(db, auditLogIdOf('visit-2'));
    assert.ok(first && second, '監査ログの変更が見つかりません');
    assert.equal(first.oldValue, second.oldValue);
    assert.equal(first.newValue, second.newValue);
    assert.equal(first.operatedBy, second.operatedBy);
    assert.equal(first.reason, '飼い主の都合');
    assert.equal(second.reason, '来院前に回復したため');
  });

  it('業務イベントのない変更は、理由が無い変更として分かる', () => {
    reserveVisit(db, { visitId: 'visit-2', petName: 'タマ' });
    cancelVisit(db, cancelInput);
    completeVisit(db, { visitId: 'visit-2', operatedBy: '獣医師' });
    const completedLogId = auditLogIdOf('visit-2');
    const change = explainChange(db, completedLogId);
    assert.ok(change, '監査ログの変更が見つかりません');
    assert.equal(change.newValue, 'completed');
    assert.equal(change.eventName, null);
    assert.equal(change.reason, null);
    const withoutReason = findChangesWithoutReason(db);
    assert.equal(withoutReason.length, 1);
    assert.equal(withoutReason[0]?.auditLogId, completedLogId);
    assert.equal(withoutReason[0]?.rowId, 'visit-2');
    assert.equal(withoutReason[0]?.oldValue, 'reserved');
    assert.equal(withoutReason[0]?.newValue, 'completed');
    assert.equal(withoutReason[0]?.operatedBy, '獣医師');
  });

  it('業務イベントの payload は変更前後の値を持たず、監査ログへの参照で結びつく', () => {
    cancelVisit(db, cancelInput);
    const event = eventsOf(visitId)[0];
    assert.ok(event, missingEvent);
    const payload = JSON.parse(String(event.payload));
    assert.deepEqual(Object.keys(payload).sort(), ['auditLogId', 'operatedBy', 'reason']);
    assert.equal(payload.auditLogId, auditLogIdOf(visitId));
  });
});
