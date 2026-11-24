import { describe, expect, it } from 'vitest';

import { describeLog } from '../../workspace/log-format';
import { tabOfKind } from '../../workspace/scenario';
import { incidentScenario } from './incident-scenario';

const { actors, reply, interim, startedAt, timeline } = incidentScenario;
if (reply === undefined || interim === undefined) {
  throw new Error('障害対応の筋書きには reply と interim が必要です');
}

const logs = tabOfKind(incidentScenario, 'logs');
const consoleTab = tabOfKind(incidentScenario, 'console');
if (logs === undefined || consoleTab === undefined || consoleTab.config.setup.kind !== 'schema') {
  throw new Error('障害対応の筋書きには、DB コンソールとログの検索のタブが必要です');
}
const earlierLogs = logs.config.earlier;
const heartbeat = logs.config.rules[0];
if (heartbeat === undefined) {
  throw new Error('ログの検索の追加の規則がありません');
}
const initialVisits = consoleTab.config.setup.rows;

const timedEvents = timeline.flatMap((event) => (event.at === undefined ? [] : [{ ...event, at: event.at }]));

const texts = [
  ...timeline.flatMap((event) => (event.kind === 'post' ? [event.post.text] : [])),
  reply.text,
  ...reply.additions.map((item) => item.text),
  ...reply.followUps.map((item) => item.text),
  interim.heading,
  interim.unknown,
];

describe('障害対応の筋書き', () => {
  it('時間で起きる出来事は、時刻の昇順に並んでいる', () => {
    const times = timedEvents.map((event) => event.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('画面の時計は 2026-11-06 18:20:00 から始まる', () => {
    expect(new Date(startedAt).toISOString()).toBe('2026-11-06T18:20:00.000Z');
  });

  it('0 秒、30 秒、36 秒、60 秒、105 秒の出来事がある', () => {
    const posts = timedEvents.flatMap((event) => (event.kind === 'post' ? [event.at] : []));
    expect(posts).toEqual([0, 36, 60, 105]);
    expect(timedEvents.filter((event) => event.at === 30).map((event) => event.kind)).toEqual([
      'log',
      'sql',
      'affected',
    ]);
  });

  it('105 秒の投稿は、最終の返信をしていない場合だけ届く', () => {
    const late = timedEvents.find((event) => event.kind === 'post' && event.at === 105);
    expect(late?.kind === 'post' && late.unlessReplied).toBe(true);
  });

  it('エージェントのタブは、「答えを見る」の合図で足して開く', () => {
    const open = timeline.find((event) => event.when === 'agent:requested');
    expect(open).toMatchObject({ kind: 'tab', tab: 'agent', action: 'open' });
    expect(incidentScenario.tabs.find((tab) => tab.key === 'agent')?.initial).toBe(false);
  });

  it('30 秒の出来事は、タマの来院を cancelled にする', () => {
    const update = timedEvents.find((event) => event.kind === 'sql');
    expect(update?.kind === 'sql' && update.sql).toBe(
      `UPDATE visits SET status = 'cancelled' WHERE id = 'visit-tama';`,
    );
    expect(initialVisits.map((visit) => [visit[0], visit[2]])).toEqual([
      ['visit-pochi', 'cancelled'],
      ['visit-tama', 'reserved'],
    ]);
  });

  it('4 秒ごとのログは、所要時間が 5〜9ms の固定の並びで決まる', () => {
    expect(heartbeat.everySeconds).toBe(4);
    for (const duration of heartbeat.durations) {
      expect(duration).toBeGreaterThanOrEqual(5);
      expect(duration).toBeLessThanOrEqual(9);
    }
    expect(heartbeat.requests.map((request) => request.path)).toEqual([
      '/visits',
      '/visits/visit-pochi',
      '/visits/visit-tama',
    ]);
    for (const millis of heartbeat.millis) {
      expect(millis).toBeGreaterThanOrEqual(0);
      expect(millis).toBeLessThan(1000);
    }
  });

  it('開始前のログは 18:14:20.455 までの 15 行で、時刻の昇順に並ぶ', () => {
    expect(earlierLogs).toHaveLength(15);
    const times = earlierLogs.map((entry) => Date.parse(entry.time));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(earlierLogs.at(-1)?.time).toBe('2026-11-06T18:14:20.455Z');
    expect(earlierLogs.filter((entry) => describeLog(entry, 0, logs.config).target)).toHaveLength(1);
  });

  it('一覧に出る開始前のログは、開始の 15 分前から後の 5 行である', () => {
    const from = startedAt - logs.config.visibleFromMinutes * 60_000;
    const shown = earlierLogs.filter((entry) => Date.parse(entry.time) >= from);
    expect(shown.map((entry) => entry.time.slice(11, 23))).toEqual([
      '18:10:41.203',
      '18:11:52.117',
      '18:11:58.846',
      '18:11:58.901',
      '18:14:20.455',
    ]);
  });

  it('投稿者の名前と最終の返信の文面がある', () => {
    expect(actors['support']?.name).toBe('カスタマーサポート');
    expect(actors['you']?.name).toBe('あなた');
    expect(reply.followUps.map((item) => item.delay)).toEqual([1.5, 1.5]);
    expect(reply.followUps.at(-1)?.text).toBe('なんで記録取ってないんですか');
    expect(reply.additions).toEqual([
      { after: 30, text: 'タマの来院も、18:20:30 に同じ操作でキャンセルになっています。' },
    ]);
  });

  it('導入では使わない語を、文面に含まない', () => {
    for (const text of texts) {
      for (const word of ['業務イベント', 'business_events', 'target_']) {
        expect(text).not.toContain(word);
      }
    }
  });
});

describe('ログの行', () => {
  it('時刻と内容から、一覧と詳細に出す値を作る', () => {
    const view = describeLog(
      { level: 'INFO', method: 'POST', path: '/visits/visit-tama/cancel', status: 200, duration: 11 },
      startedAt + 30_214,
      logs.config,
    );
    expect(view.iso).toBe('2026-11-06T18:20:30.214Z');
    expect(view.date).toBe('Nov 06 18:20:30.214');
    expect(view.content).toBe('POST /visits/visit-tama/cancel 200 11ms');
    expect(view.target).toBe(false);
    expect(view.attrs.map(([key]) => key)).toEqual([
      'http.method',
      'http.url',
      'http.status_code',
      'duration',
      'network.client.ip',
      'http.useragent',
    ]);
  });
});
