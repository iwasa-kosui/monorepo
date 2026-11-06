import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { createDatabase } from './db.ts';
import {
  cancelVisit,
  completeVisit,
  findSendRecords,
  findUnconfirmedSends,
  type ReminderCancellationMessage,
  reserveVisit,
  type SendReminderCancellation,
} from './visits.ts';

const visitId = 'visit-1';
const cancelInput = { visitId, reason: '飼い主の都合', operatedBy: '受付スタッフ' };
const missingEvent =
  `来院キャンセルの記録がありません（domain_events を aggregate_name = 'Visit'、aggregate_id = '${visitId}' で探しました）`;

let db: DatabaseSync;
let sent: ReminderCancellationMessage[];

const send: SendReminderCancellation = async (message) => {
  sent.push(message);
};
const sendFailing: SendReminderCancellation = async () => {
  throw new Error('送信先に接続できません');
};

const statusOf = (id: string) => db.prepare(`SELECT status FROM visits WHERE id = ?`).get(id)?.status;
const eventsOf = (id: string) =>
  db.prepare(`SELECT * FROM domain_events WHERE aggregate_name = 'Visit' AND aggregate_id = ?`).all(id);

beforeEach(() => {
  db = createDatabase();
  sent = [];
  reserveVisit(db, { visitId, petName: 'ポチ' });
});

describe('既存の業務', () => {
  it('予約した来院をキャンセルすると、来院の状態がキャンセルになる', async () => {
    await cancelVisit(db, send, cancelInput);
    assert.equal(statusOf(visitId), 'cancelled');
  });

  it('診察が終わった来院はキャンセルできない', async () => {
    completeVisit(db, { visitId });
    await assert.rejects(() => cancelVisit(db, send, cancelInput), /キャンセルできません/);
    assert.equal(statusOf(visitId), 'completed');
  });

  it('キャンセルできなかったときは、記録を残さない', async () => {
    completeVisit(db, { visitId });
    await assert.rejects(() => cancelVisit(db, send, cancelInput));
    assert.equal(eventsOf(visitId).length, 0);
  });

  it('来院の更新に失敗したら、記録も残らない', async () => {
    db.exec(`
      CREATE TRIGGER reject_update BEFORE UPDATE ON visits
      BEGIN
        SELECT RAISE(ABORT, '更新に失敗しました');
      END;
    `);
    await assert.rejects(() => cancelVisit(db, send, cancelInput), /更新に失敗しました/);
    assert.equal(eventsOf(visitId).length, 0);
  });
});

describe('第2章 ステップ1', () => {
  it('来院をキャンセルすると、来院キャンセルの記録が1行残る', async () => {
    await cancelVisit(db, send, cancelInput);
    const events = eventsOf(visitId).filter((event) => event.event_name === 'VisitCancelled');
    assert.equal(events.length, 1, missingEvent);
    assert.equal(events[0]?.event_name, 'VisitCancelled');
  });

  it('キャンセルの記録に、キャンセル後の来院の状態が残る', async () => {
    await cancelVisit(db, send, cancelInput);
    const event = eventsOf(visitId)[0];
    assert.ok(event, missingEvent);
    assert.equal(JSON.parse(String(event.aggregate_props)).status, 'cancelled');
  });

  it('記録に失敗したら、来院のキャンセルも失敗する', async () => {
    db.exec(`
      CREATE TRIGGER reject_event BEFORE INSERT ON domain_events
      BEGIN
        SELECT RAISE(ABORT, '記録に失敗しました');
      END;
    `);
    await assert.rejects(
      () => cancelVisit(db, send, cancelInput),
      /記録に失敗しました/,
      '記録の失敗が更新処理に伝わっていません',
    );
    assert.equal(statusOf(visitId), 'reserved');
  });
});

describe('第2章 ステップ2', () => {
  it('キャンセルした人と理由を答えられる', async () => {
    await cancelVisit(db, send, cancelInput);
    const answer = db.prepare(`
      SELECT
        event_at,
        event_name,
        payload ->> '$.operatedBy' AS operated_by,
        payload ->> '$.reason' AS reason
      FROM domain_events
      WHERE aggregate_name = 'Visit' AND aggregate_id = ?
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

describe('外部システムへの送信', () => {
  it('キャンセルすると、予約リマインドの取消を送る', async () => {
    await cancelVisit(db, send, cancelInput);
    assert.deepEqual(sent, [{ visitId, petName: 'ポチ' }]);
  });

  it('送信に失敗しても、来院のキャンセルは取り消されない', async () => {
    await assert.rejects(() => cancelVisit(db, sendFailing, cancelInput), /送信先に接続できません/);
    assert.equal(statusOf(visitId), 'cancelled');
    assert.equal(eventsOf(visitId).filter((event) => event.event_name === 'VisitCancelled').length, 1);
  });

  it('来院の更新に失敗したら、予約リマインドの取消を送らない', async () => {
    db.exec(`
      CREATE TRIGGER reject_update BEFORE UPDATE ON visits
      BEGIN
        SELECT RAISE(ABORT, '更新に失敗しました');
      END;
    `);
    await assert.rejects(() => cancelVisit(db, send, cancelInput), /更新に失敗しました/);
    assert.deepEqual(sent, []);
  });
});

describe('第4章 外部システムとの同期', () => {
  it('外部システムへ送った内容と時刻を、キャンセルの理由と一緒に答えられる', async () => {
    await cancelVisit(db, send, cancelInput);
    const records = findSendRecords(db, visitId);
    assert.equal(records.length, 1);
    const record = records[0];
    assert.ok(record, '送信の記録がありません（domain_events の ReminderCancellationRequested を探しました）');
    assert.deepEqual(record.message, { visitId, petName: 'ポチ' });
    assert.equal(record.result, 'sent');
    assert.equal(record.reason, cancelInput.reason);
    assert.equal(record.operatedBy, cancelInput.operatedBy);
    assert.equal(record.error, null);
    assert.ok(!Number.isNaN(Date.parse(record.requestedAt)), '送信を依頼した時刻を答えられません');
    assert.ok(!Number.isNaN(Date.parse(String(record.finishedAt))), '送信が終わった時刻を答えられません');
  });

  it('送信に失敗したら、失敗の理由が記録に残る', async () => {
    await assert.rejects(() => cancelVisit(db, sendFailing, cancelInput), /送信先に接続できません/);
    const record = findSendRecords(db, visitId)[0];
    assert.ok(record, '送信の記録がありません（domain_events の ReminderCancellationRequested を探しました）');
    assert.equal(record.result, 'failed');
    assert.equal(record.error, '送信先に接続できません');
    assert.equal(record.reason, cancelInput.reason);
    assert.ok(!Number.isNaN(Date.parse(String(record.finishedAt))), '送信が失敗した時刻を答えられません');
  });

  it('送信の予定を記録できなければ、来院のキャンセルも外部への送信もしない', async () => {
    db.exec(`
      CREATE TRIGGER reject_requested BEFORE INSERT ON domain_events
      WHEN NEW.event_name = 'ReminderCancellationRequested'
      BEGIN
        SELECT RAISE(ABORT, '送信の予定の記録に失敗しました');
      END;
    `);
    await assert.rejects(() => cancelVisit(db, send, cancelInput), /送信の予定の記録に失敗しました/);
    assert.equal(statusOf(visitId), 'reserved');
    assert.equal(eventsOf(visitId).length, 0);
    assert.deepEqual(sent, []);
  });

  it('送信後の記録に失敗したら、結果が未確認の送信として分かる', async () => {
    db.exec(`
      CREATE TRIGGER reject_sent BEFORE INSERT ON domain_events
      WHEN NEW.event_name = 'ReminderCancellationSent'
      BEGIN
        SELECT RAISE(ABORT, '送信結果の記録に失敗しました');
      END;
    `);
    await assert.rejects(() => cancelVisit(db, send, cancelInput), /送信結果の記録に失敗しました/);
    assert.equal(statusOf(visitId), 'cancelled');
    assert.equal(sent.length, 1);
    const unconfirmed = findUnconfirmedSends(db);
    assert.equal(unconfirmed.length, 1);
    assert.equal(unconfirmed[0]?.visitId, visitId);
    assert.deepEqual(unconfirmed[0]?.message, { visitId, petName: 'ポチ' });
    assert.ok(!Number.isNaN(Date.parse(String(unconfirmed[0]?.requestedAt))), '送信を依頼した時刻を答えられません');
    const record = findSendRecords(db, visitId)[0];
    assert.equal(record?.result, 'unconfirmed');
    assert.equal(record?.finishedAt, null);
  });
});
