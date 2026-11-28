import { describe, expect, it } from 'vitest';

import { dayDividers } from '../../workspace/channel';
import { minuteMs } from '../../workspace/log-search';
import { tabOfKind } from '../../workspace/scenario';
import { assertScenario } from '../../workspace/validate';
import { devChannel, incidentDay, inquiryChannel } from '../chapters/common';
import {
  accessLogArchive,
  accessLogLimit,
  anotherInquiry,
  backupLimit,
  backupRestoreLimit,
  backups,
  checkInInquiry,
  evidenceScenario,
} from './evidence-scenario';
import { incidentScenario } from './incident-scenario';

describe('証拠の調査の筋書き', () => {
  it('筋書きの検査を通る', () => {
    expect(() => assertScenario(evidenceScenario)).not.toThrow();
  });

  it('ページを開くと、導入の問い合わせとは別の問い合わせが「# 問い合わせ対応」に2件届く', () => {
    expect(evidenceScenario.timeline.slice(0, 2)).toEqual([
      { at: 0, kind: 'post', post: anotherInquiry },
      { at: 2, kind: 'post', post: checkInInquiry },
    ]);
    for (const post of [anotherInquiry, checkInInquiry]) {
      expect(post.actor).toBe('support');
      expect(post.channel ?? evidenceScenario.chat.channel).toBe(inquiryChannel);
    }
    expect(checkInInquiry.text).toContain('3ヶ月くらい前');
    expect(checkInInquiry.text).toContain('いつ誰が受付したか');
    expect(evidenceScenario.history.map((post) => post.text)).not.toContain(checkInInquiry.text);
  });

  it('導入の問い合わせは障害対応の日の発言で、別の問い合わせは今日の発言なので、間に日付の区切りが入る', () => {
    expect(evidenceScenario.startedAt - incidentScenario.startedAt).toBeGreaterThan(24 * 60 * minuteMs);
    expect(evidenceScenario.history.map((post) => post.day)).toEqual([incidentDay, incidentDay]);
    expect(dayDividers([...evidenceScenario.history, anotherInquiry, checkInInquiry])).toEqual([
      incidentDay,
      null,
      '今日',
      null,
    ]);
  });

  it('同僚の発言はすべて「# dev」に属して、ログのタブを開くと2件、バックアップの復元で2件が届く', () => {
    expect(devChannel).toBe('# dev');
    expect(evidenceScenario.timeline.slice(2)).toEqual([
      { when: 'tab:selected', key: 'logs', kind: 'post', post: accessLogArchive },
      { when: 'tab:selected', key: 'logs', kind: 'post', post: accessLogLimit, delay: 6 },
      { when: 'tab:selected', key: 'logs', kind: 'tab', tab: 'explain', action: 'add' },
      { when: 'sql:executed', key: 'restored', kind: 'post', post: backupRestoreLimit },
      { when: 'sql:executed', key: 'restored', kind: 'post', post: backupLimit, delay: 6 },
      { when: 'sql:executed', key: 'restored', kind: 'tab', tab: 'explain', action: 'add' },
    ]);
    for (const post of [accessLogLimit, accessLogArchive, backupLimit, backupRestoreLimit]) {
      expect(post.actor).toBe('colleague');
      expect(post.channel).toBe(devChannel);
      expect(post.day).toBeUndefined();
    }
  });

  it('最初のタブは DB コンソールで、アクセスログのタブは開いたときに確認済みになる', () => {
    expect(evidenceScenario.tabs.map((tab) => tab.key)).toEqual(['console', 'logs', 'backup', 'explain']);
    expect(evidenceScenario.tabs.find((tab) => tab.key === 'logs')?.seen).toEqual({
      name: 'tab:selected',
      key: 'logs',
    });
    expect(evidenceScenario.done).toEqual({
      all: ['sql:target-shown', { name: 'tab:selected', key: 'logs' }, { name: 'sql:executed', key: 'restored' }],
    });
  });

  it('アクセスログには、表示する範囲の中のログだけがあり、受付とキャンセルのログは無い', () => {
    const config = tabOfKind(evidenceScenario, 'logs')?.config;
    expect(config?.target).toBeUndefined();
    const from = evidenceScenario.startedAt - (config?.visibleFromMinutes ?? 0) * minuteMs;
    expect(config?.earlier.length).toBeGreaterThan(0);
    for (const entry of config?.earlier ?? []) {
      const time = Date.parse(entry.time);
      expect(time).toBeGreaterThanOrEqual(from);
      expect(time).toBeLessThan(evidenceScenario.startedAt);
      expect(entry.method).toBe('GET');
    }
  });

  it('定期バックアップは、2026-08-01 までが予約済みで、2026-09-01 からが受付済みである', () => {
    const statusOf = (sql: string): string => /'visit-pochi', 'ポチ', '([a-z_]+)'/.exec(sql)?.[1] ?? '';
    expect(backups.map((backup) => [backup.label, statusOf(backup.sql)])).toEqual([
      ['2026-06-01 00:00', 'reserved'],
      ['2026-07-01 00:00', 'reserved'],
      ['2026-08-01 00:00', 'reserved'],
      ['2026-09-01 00:00', 'checked_in'],
      ['2026-10-01 00:00', 'checked_in'],
      ['2026-11-01 00:00', 'checked_in'],
    ]);
  });

  it('調査メモは、誰が、いつ、何をの3項目で、受付した人はどこにも残っていない', () => {
    expect(evidenceScenario.memo?.items.map((item) => [item.label, item.text, item.result])).toEqual([
      ['誰が', 'どこにも残っていない', 'missing'],
      ['いつ', '8月1日から9月1日の間', 'found'],
      ['何を', '予約済みから受付済み', 'found'],
    ]);
  });

  it('解説のタブは、ログのタブを開いたときとバックアップの復元で追加される', () => {
    const additions = evidenceScenario.timeline.filter((event) => event.kind === 'tab');
    expect(additions).toHaveLength(2);
    for (const event of additions) {
      expect(event).toMatchObject({ tab: 'explain', action: 'add' });
    }
    expect(additions.map((event) => [event.when, event.key])).toEqual([
      ['tab:selected', 'logs'],
      ['sql:executed', 'restored'],
    ]);
  });

  it('解説の文書のタブがあり、最初は表示されない', () => {
    const explain = evidenceScenario.tabs.find((tab) => tab.key === 'explain');
    expect(explain?.kind).toBe('doc');
    expect(explain?.initial).toBe(false);
  });
});
