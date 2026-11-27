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

const unlessRepliedAt = (at: number): boolean | undefined => {
  const event = timedEvents.find((item) => item.kind === 'post' && item.at === at);
  return event?.kind === 'post' ? event.unlessReplied === true : undefined;
};

const texts = [
  ...timeline.flatMap((event) => (event.kind === 'post' ? [event.post.text] : [])),
  ...reply.lines.map((line) => line.text),
  ...reply.followUps.map((item) => item.text),
  interim.heading,
  interim.unknown,
  interim.pending,
];

describe('障害対応の筋書き', () => {
  it('時間で起きる出来事は、時刻の昇順に並んでいる', () => {
    const times = timedEvents.map((event) => event.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('画面の時計は 2026-11-06 18:20:00 から始まる', () => {
    expect(new Date(startedAt).toISOString()).toBe('2026-11-06T18:20:00.000Z');
  });

  it('連絡は 0 秒、20 秒、34 秒、56 秒に始まり、1 つの連絡は短い投稿を数件に分けて届ける', () => {
    const posts = timedEvents.flatMap((event) => (event.kind === 'post' ? [event.at] : []));
    expect(posts).toEqual([0, 2, 5, 20, 23, 34, 56]);
    expect(timedEvents.flatMap((event) => (event.kind === 'post' ? [event.post.text] : []))).toEqual([
      'お疲れ様です！すみません、急ぎで見てほしいです🙏',
      '動物病院さんから電話があって、予約してたはずの来院がキャンセルになってるそうです。飼い主さんがもう受付に来ちゃってて…',
      'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？',
      'すみません、もう1件です',
      '別の飼い主さんからも同じ連絡が来てて、タマちゃん（visit-tama）もキャンセルになってます。さっき見たときは予約のままだったんですが…',
      '病院さんに折り返さないとなので、わかってるところまででいいので教えてください！',
      'どうでしょう…？病院さんずっとお待ちで💦',
    ]);
    expect(timedEvents.filter((event) => event.at === 15).map((event) => event.kind)).toEqual([
      'log',
      'sql',
      'affected',
    ]);
  });

  it('34 秒と 56 秒の投稿は、最終の返信をしていない場合だけ届く', () => {
    expect(unlessRepliedAt(34)).toBe(true);
    expect(unlessRepliedAt(56)).toBe(true);
  });

  it('23 秒までの投稿は、最終の返信をした後も届く', () => {
    for (const event of timedEvents.filter((item) => item.kind === 'post' && item.at <= 23)) {
      expect(event.kind === 'post' && event.unlessReplied, `${event.at} 秒`).not.toBe(true);
    }
  });

  it('エージェントのタブは、「答えを見る」の合図で足して開く', () => {
    const open = timeline.find((event) => event.when === 'agent:requested');
    expect(open).toMatchObject({ kind: 'tab', tab: 'agent', action: 'open' });
    expect(incidentScenario.tabs.find((tab) => tab.key === 'agent')?.initial).toBe(false);
  });

  it('15 秒の出来事は、タマの来院を cancelled にする', () => {
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

  it('チャンネルの既定は「# 問い合わせ対応」で、一覧の末尾に「# ハンズオン」がある', () => {
    const { chat } = incidentScenario;
    expect(chat.channel).toBe('# 問い合わせ対応');
    expect(chat.channels.find((channel) => channel.current === true)?.name).toBe('# 問い合わせ対応');
    expect(chat.channels.map((channel) => channel.name).at(-1)).toBe('# ハンズオン');
    expect(actors['kosui']).toBeUndefined();
  });

  it('投稿者の名前と最終の返信の文面がある', () => {
    expect(actors['support']?.name).toBe('カスタマーサポート');
    expect(actors['you']?.name).toBe('あなた');
    expect(reply.followUps.map((item) => item.delay)).toEqual([0.8, 0.8, 1]);
    expect(reply.followUps.map((item) => item.text)).toEqual([
      'えっ',
      '誰がなんでキャンセルしたか分からないと、病院さんに説明できないです…',
      'なんで記録取ってないんですか',
    ]);
    expect(reply.lines).toEqual([
      { text: '18:11:58 にポチの来院をキャンセルする操作があったのは確認できました' },
      { after: 15, text: 'タマの来院も 18:20:15 に同じ操作でキャンセルされてます' },
      { text: 'ただ、誰がなんでキャンセルしたかは、DB にもログにもコードにも残ってなくて、分からないです…' },
    ]);
    expect(interim).toMatchObject({
      heading: 'いま分かってるところです',
      unknown: 'まだ何も分かってないです、調査中です',
      pending: '{labels} は調査中です',
    });
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
      startedAt + 15_214,
      logs.config,
    );
    expect(view.iso).toBe('2026-11-06T18:20:15.214Z');
    expect(view.date).toBe('Nov 06 18:20:15.214');
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
