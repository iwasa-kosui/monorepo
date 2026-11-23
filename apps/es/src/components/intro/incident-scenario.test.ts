import { describe, expect, it } from 'vitest';

import { describeLog } from './incident-log';
import {
  actors,
  cancelTamaSql,
  earlierLogs,
  heartbeat,
  initialVisits,
  interim,
  reply,
  startedAt,
  timeline,
  visibleFromMinutes,
} from './incident-scenario';

const texts = [
  ...timeline.flatMap((event) => (event.kind === 'post' ? [event.post.text] : [])),
  reply.text,
  reply.tamaText,
  ...reply.followUps.map((item) => item.text),
  interim.heading,
  interim.unknown,
];

describe('障害対応の筋書き', () => {
  it('時間で起きる出来事は、時刻の昇順に並んでいる', () => {
    const times = timeline.map((event) => event.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('画面の時計は 2026-11-06 18:20:00 から始まる', () => {
    expect(new Date(startedAt).toISOString()).toBe('2026-11-06T18:20:00.000Z');
  });

  it('0 秒、30 秒、36 秒、60 秒、105 秒の出来事がある', () => {
    const posts = timeline.flatMap((event) => (event.kind === 'post' ? [event.at] : []));
    expect(posts).toEqual([0, 36, 60, 105]);
    expect(timeline.filter((event) => event.at === 30).map((event) => event.kind)).toEqual([
      'log',
      'sql',
      'affected',
    ]);
  });

  it('105 秒の投稿は、最終の返信をしていない場合だけ届く', () => {
    const late = timeline.find((event) => event.kind === 'post' && event.at === 105);
    expect(late?.kind === 'post' && late.unlessReplied).toBe(true);
  });

  it('30 秒の出来事は、タマの来院を cancelled にする', () => {
    expect(cancelTamaSql).toBe(`UPDATE visits SET status = 'cancelled' WHERE id = 'visit-tama';`);
    expect(initialVisits.map((visit) => [visit.id, visit.status])).toEqual([
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
    expect(earlierLogs.filter((entry) => describeLog(entry, 0).cancel)).toHaveLength(1);
  });

  it('一覧に出る開始前のログは、開始の 15 分前から後の 5 行である', () => {
    const from = startedAt - visibleFromMinutes * 60_000;
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
    expect(actors.support.name).toBe('カスタマーサポート');
    expect(actors.you.name).toBe('あなた');
    expect(reply.followUps.map((item) => item.delay)).toEqual([1.5, 1.5]);
    expect(reply.followUps.at(-1)?.text).toBe('なんで記録取ってないんですか');
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
    );
    expect(view.iso).toBe('2026-11-06T18:20:30.214Z');
    expect(view.date).toBe('Nov 06 18:20:30.214');
    expect(view.content).toBe('POST /visits/visit-tama/cancel 200 11ms');
    expect(view.cancel).toBe(false);
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
