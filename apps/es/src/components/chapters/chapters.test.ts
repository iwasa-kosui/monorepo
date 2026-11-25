import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { projectFilesOf } from '../../lib/snapshots';
import { signalNames, type WorkspaceScenario } from '../../workspace/scenario';
import { scenarioProblems } from '../../workspace/validate';
import { incidentScenario } from '../intro/incident-scenario';
import { lessonScenarios } from './index';

const entries = Object.entries(lessonScenarios);

const mdxOf = (id: string): string =>
  readFileSync(new URL(`../../content/chapters/${id}.mdx`, import.meta.url), 'utf8');

const textsOf = (scenario: WorkspaceScenario): string[] => [
  scenario.label,
  scenario.chat.workspace,
  scenario.chat.channel,
  scenario.chat.placeholder,
  ...scenario.chat.channels.map((channel) => channel.name),
  ...scenario.chat.buttons.map((button) => button.label),
  ...Object.values(scenario.actors).flatMap((actor) => [actor.name, actor.avatar]),
  ...scenario.history.map((post) => post.text),
  ...scenario.timeline.flatMap((event) => (event.kind === 'post' ? [event.post.text] : [])),
  ...(scenario.memo === undefined
    ? []
    : [scenario.memo.title, scenario.memo.unknown, ...scenario.memo.items.flatMap((item) => [item.label, item.text])]),
  ...(scenario.gates === undefined
    ? []
    : [
      ...scenario.gates.reply.requires.map((item) => item.reason),
      scenario.gates.reply.reasons.all,
      scenario.gates.reply.reasons.several,
    ]),
  ...(scenario.reply === undefined
    ? []
    : [...scenario.reply.lines.map((line) => line.text), ...scenario.reply.followUps.map((item) => item.text)]),
  ...scenario.tabs.flatMap((tab) => [tab.title, tab.label, tab.url, tab.note ?? '']),
  ...scenario.tabs.flatMap((tab) =>
    tab.kind === 'doc'
      ? [tab.config.title, tab.config.updatedBy]
      : tab.kind === 'pr'
      ? [tab.config.title, tab.config.owner, tab.config.name]
      : tab.kind === 'editor'
      ? [tab.config.project, tab.config.branch, ...projectFilesOf(tab.config.snapshot)]
      : []
  ),
];

const postsOf = (scenario: WorkspaceScenario): { readonly actor: string; readonly text: string }[] => [
  ...scenario.history,
  ...scenario.timeline.flatMap((event) => (event.kind === 'post' ? [event.post] : [])),
];

const summary = (scenario: WorkspaceScenario): string[] =>
  scenario.tabs.map((tab) => `${tab.key}:${tab.kind}:${tab.title}`);

const inquiry = 'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？';
const whyNotRecorded = 'なんで記録取ってないんですか';
const afterIncident = 'さっきの件、おつかれさまでした';
const ownQuestion =
  '自分が担当してるシステムで、いまのデータだけだと答えられない質問って何かあります？1つ書いてみてほしいです';
const wantRecord = '再発防止で、キャンセルしたときに記録を残すようにしたいです';
const runTests = '先にテストを書いておいたので、まず流してみてください。いまは4件落ちるはずです';
const failedFour = '落ちた4件が、これから足すところです👍';
const decisionRecord = '方針を ADR にまとめました。ざっと読んでもらえると助かります';
const tableRecord = '記録を1つのテーブルにまとめる案も ADR にしました';
const prSeen = 'PR 見ました！差分、思ったより小さいですね';
const prRemaining = '足したあとに残る作業も書いておきます';
const thanks = 'わー、ありがとうございます！これで次からは答えられますね🙏';
const otherClinicFirst = 'お疲れ様です！別の病院さんから、また同じ問い合わせが来てて…';
const otherClinicSecond = 'ポチちゃんの来院（visit-pochi）、なんでキャンセルになってるか分かりますか？';
const staffReply = '受付スタッフが、飼い主の都合でキャンセルしてます';
const answeredThanks = 'はやっ！ありがとうございます、病院さんに伝えます🙏';
const tamaAsked = 'あと、タマちゃん（visit-tama）の方もキャンセルの理由わかりますか？';
const tamaAnswer = 'タマの方は、記録を足す前のキャンセルなので、理由は残ってないです…';
const tamaAcknowledged = 'そうなんですね…了解です';
const otherTeams = '記録の話、ほかのチームからも相談が来てます';
const threeConsultations =
  '3つあるので順番に見ていきましょう。自分が挙げた質問に近いのはどれか、考えながら見てもらえると';
const financeGreeting = 'お疲れ様です。昨日のキャンセル件数の件で質問です';
const financeAsked = '集計だと3件なんですが、一覧で数えると2件しかなくて…どっちが正しいですか？';
const financeAnswer = '記録から数え直すと2件でした。集計の3件のうち1件は、対応する記録が無いです';
const financeThanks = 'なるほど、助かります！';
const reminderGreeting = 'すみません、また1件お願いします🙏';
const reminderAsked =
  'キャンセルしたのにリマインドの通知が届いた、って飼い主さんから連絡があって…取り消しって送れてますか？';
const reminderAnswer = '送信の記録を見ました。取り消しを送ったあと、結果が確認できてない送信が1件あります';
const reminderThanks = 'ありがとうございます、飼い主さんに確認してみます！';
const auditGreeting = 'お疲れ様です、監査対応で確認させてください';
const auditAsked = '監査ログに reserved → cancelled の変更は残ってるんですが、理由が載ってなくて。分かりますか？';
const auditAnswer = '監査ログと記録を突き合わせると、理由が分かる変更と、分からない変更があります。一覧を出しました';
const auditThanks = 'ありがとうございます。理由が無い分は別途確認します';
const comparisonMade = '3つを同じ軸で並べた表を作りました';
const chooseOne = '自分のシステムに近いのを1つ選んでみてください';
const takeHome = '時間の関係で、実装は持ち帰りにします';
const startingCodes = '開始コードを3つ置いておくので、選んだパターンで試してみてください';
const goodWork = 'おつかれさまでした！';
const todayMemo = '今日やったことを設計メモにまとめました';
const decideLast = '最後に、自分のシステムで記録を足す更新処理を1つ決めて、ここに書いてみてください';
const skipIfNone = '答えたい質問が特に無ければ、足さなくて大丈夫です';

const answered: readonly (readonly [string, string])[] = [
  ['support', inquiry],
  ['support', whyNotRecorded],
  ['support', otherClinicFirst],
  ['support', otherClinicSecond],
  ['you', staffReply],
  ['support', answeredThanks],
];
const earlier: readonly (readonly [string, string])[] = [
  ['support', inquiry],
  ['support', whyNotRecorded],
  ['techlead', afterIncident],
  ['techlead', ownQuestion],
  ['techlead', wantRecord],
  ['techlead', runTests],
  ['techlead', failedFour],
];

const chapter4Texts = [
  otherTeams,
  threeConsultations,
  financeGreeting,
  financeAsked,
  financeAnswer,
  financeThanks,
  reminderGreeting,
  reminderAsked,
  reminderAnswer,
  reminderThanks,
  auditGreeting,
  auditAsked,
  auditAnswer,
  auditThanks,
  comparisonMade,
  chooseOne,
  takeHome,
  startingCodes,
  goodWork,
  todayMemo,
  decideLast,
  skipIfNone,
];

const pairs = (scenario: WorkspaceScenario): (readonly [string, string])[] =>
  postsOf(scenario).map((post) => [post.actor, post.text] as const);

const opened = (scenario: WorkspaceScenario): (readonly [string, string])[] =>
  scenario.timeline.flatMap((
    event,
  ) => (event.at !== undefined && event.kind === 'post' ? [[event.post.actor, event.post.text] as const] : []));

const openedAt = (scenario: WorkspaceScenario): (number | undefined)[] =>
  scenario.timeline.flatMap((event) => (event.at !== undefined && event.kind === 'post' ? [event.at] : []));

describe('第1章から第4章とまとめの筋書き', () => {
  it('19 ページ分あり、章のページと同じ ID を持つ', () => {
    expect(Object.keys(lessonScenarios)).toEqual([
      'chapter-1/01',
      'chapter-1/02',
      'chapter-2/01',
      'chapter-2/02',
      'chapter-2/03',
      'chapter-2/04',
      'chapter-2/05',
      'chapter-3/01',
      'chapter-3/02',
      'chapter-3/03',
      'chapter-3/04',
      'chapter-4/01',
      'chapter-4/02',
      'chapter-4/03',
      'chapter-4/04',
      'chapter-4/05',
      'chapter-4/06',
      'summary/01',
      'summary/02',
    ]);
    expect(new Set(entries.map(([, scenario]) => scenario.id)).size).toBe(19);
  });

  it.each(entries)('%s は、検査に通り、時計の無い筋書きで、MDX のスロットと対応している', (id, scenario) => {
    expect(scenarioProblems(scenario)).toEqual([]);
    expect(scenario.mode).toBe('untimed');
    const source = mdxOf(id);
    expect(source).toContain(`scenario={`);
    const slots = [...source.matchAll(/<Fragment slot="([^"]+)">/g)].map((match) => match[1]);
    const slotted = scenario.tabs.filter((tab) => tab.kind !== 'console').map((tab) => tab.key);
    expect(slots.filter((slot) => slot !== 'composer').sort()).toEqual(slotted.sort());
  });

  it('発言者は、カスタマーサポート、あなた、テックリード、経理、情シスの 5 人で、頭文字と色が異なる', () => {
    for (const [, scenario] of entries) {
      const actors = Object.values(scenario.actors);
      expect(actors.map((actor) => [actor.name, actor.avatar, actor.tone])).toEqual([
        ['カスタマーサポート', 'カ', 'rose'],
        ['あなた', 'あ', 'blue'],
        ['テックリード', 'テ', 'violet'],
        ['経理', '経', 'green'],
        ['情シス', '情', 'amber'],
      ]);
      expect(new Set(actors.map((actor) => actor.avatar)).size).toBe(5);
      expect(new Set(actors.map((actor) => actor.tone)).size).toBe(5);
      expect(Object.values(scenario.actors).filter((actor) => actor.self === true).map((actor) => actor.name)).toEqual([
        'あなた',
      ]);
    }
  });

  it('導入の発言者の名前と頭文字を引き継ぐ', () => {
    const [, first] = entries[0] ?? [];
    expect(first?.actors['support']).toEqual(incidentScenario.actors['support']);
    expect(first?.actors['you']).toEqual(incidentScenario.actors['you']);
  });

  it('チャンネルは「# 問い合わせ対応」', () => {
    for (const [, scenario] of entries) {
      expect(scenario.chat.channel).toBe('# 問い合わせ対応');
      expect(scenario.chat.channels.find((channel) => channel.current === true)?.name).toBe('# 問い合わせ対応');
    }
  });

  it('折りたたむのは、演習の 2 ページだけ', () => {
    expect(entries.filter(([, scenario]) => scenario.chat.collapsed === true).map(([id]) => id)).toEqual([
      'chapter-2/02',
      'chapter-2/04',
    ]);
  });

  it('投稿の文は、定めた文だけである', () => {
    const allowed = new Set([
      inquiry,
      whyNotRecorded,
      afterIncident,
      ownQuestion,
      wantRecord,
      runTests,
      failedFour,
      decisionRecord,
      tableRecord,
      prSeen,
      prRemaining,
      thanks,
      otherClinicFirst,
      otherClinicSecond,
      staffReply,
      answeredThanks,
      tamaAsked,
      tamaAnswer,
      tamaAcknowledged,
      ...chapter4Texts,
    ]);
    for (const [id, scenario] of entries) {
      for (const post of postsOf(scenario)) {
        expect(allowed.has(post.text), `${id}: ${post.text}`).toBe(true);
      }
    }
  });

  it('投稿の文に、教材の本文の文をそのまま使わない', () => {
    for (const [id, scenario] of entries) {
      const source = mdxOf(id);
      const sentences = source.split(/[。\n]/).map((line) => line.trim()).filter((line) => line.length >= 12);
      for (const post of postsOf(scenario)) {
        for (const sentence of sentences) {
          expect(post.text, `${id}: ${sentence}`).not.toContain(sentence);
        }
      }
    }
  });

  it('投稿に使う絵文字は、定めた文面のものだけである', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const [id, scenario] of entries) {
      for (const post of postsOf(scenario)) {
        if (emoji.test(post.text)) {
          expect([failedFour, thanks, answeredThanks, reminderGreeting], id).toContain(post.text);
        }
      }
    }
  });

  it('開いた時点の投稿は、2 秒おきに 1 件ずつ届く', () => {
    for (const [id, scenario] of entries) {
      const times = openedAt(scenario);
      expect(times, id).toEqual(times.map((_, index) => index * 2));
    }
  });

  describe('第1章', () => {
    it('1 ページ目は、導入のやり取りを履歴に持ち、開いた時点でテックリードが 2 件投稿する', () => {
      const scenario = lessonScenarios['chapter-1/01'];
      expect(scenario).toBeDefined();
      if (scenario === undefined) return;
      expect(scenario.history.map((post) => [post.actor, post.text])).toEqual([
        ['support', inquiry],
        ['support', whyNotRecorded],
      ]);
      expect(opened(scenario)).toEqual([['techlead', afterIncident], ['techlead', ownQuestion]]);
      expect(summary(scenario)).toEqual(['memo:doc:データ変更の記録について']);
    });

    it('2 ページ目は、1 ページ目の投稿を履歴に持ち、テスト実行の合図で投稿する', () => {
      const scenario = lessonScenarios['chapter-1/02'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(scenario.history.map((post) => [post.actor, post.text])).toEqual([
        ['support', inquiry],
        ['support', whyNotRecorded],
        ['techlead', afterIncident],
        ['techlead', ownQuestion],
      ]);
      expect(opened(scenario)).toEqual([['techlead', wantRecord], ['techlead', runTests]]);
      const waiting = scenario.timeline.flatMap((event) => (event.when === undefined ? [] : [event]));
      expect(waiting).toMatchObject([{
        when: 'tests:ran',
        kind: 'post',
        post: { actor: 'techlead', text: failedFour },
      }]);
      expect(summary(scenario)).toEqual(['editor:editor:visits.test.ts — clinic-api', 'guide:doc:テストの読み方']);
    });
  });

  describe('第2章', () => {
    it('ADR の 2 ページは、それまでの投稿を履歴に持ち、テックリードが1件投稿する', () => {
      const expected: [string, readonly (readonly [string, string])[], string][] = [
        ['chapter-2/01', earlier, decisionRecord],
        ['chapter-2/03', [...earlier, ['techlead', decisionRecord]], tableRecord],
      ];
      for (const [id, history, post] of expected) {
        const scenario = lessonScenarios[id];
        if (scenario === undefined) throw new Error(id);
        expect(scenario.history.map((item) => [item.actor, item.text]), id).toEqual(history);
        expect(opened(scenario), id).toEqual([['techlead', post]]);
      }
    });

    it('タブの種類と名前', () => {
      expect(summary(lessonScenarios['chapter-2/01'] as WorkspaceScenario)).toEqual([
        'memo:doc:ADR 1: 更新処理の中で記録する',
      ]);
      expect(summary(lessonScenarios['chapter-2/02'] as WorkspaceScenario)).toEqual([
        'editor:editor:visits.ts — clinic-api',
      ]);
      expect(summary(lessonScenarios['chapter-2/03'] as WorkspaceScenario)).toEqual([
        'memo:doc:ADR 2: 記録を1つのテーブルにまとめる',
      ]);
      expect(summary(lessonScenarios['chapter-2/04'] as WorkspaceScenario)).toEqual([
        'editor:editor:visits.ts — clinic-api',
      ]);
      expect(summary(lessonScenarios['chapter-2/05'] as WorkspaceScenario)).toEqual([
        'pr:pr:キャンセルの記録を足す',
      ]);
    });

    it('演習の 2 ページは、導入の問い合わせを履歴に持ち、ステップ2だけテスト成功の合図で礼を投稿する', () => {
      const step1 = lessonScenarios['chapter-2/02'];
      const step2 = lessonScenarios['chapter-2/04'];
      if (step1 === undefined || step2 === undefined) throw new Error('筋書きがありません');
      expect(pairs(step1)).toEqual([['support', inquiry]]);
      expect(step1.timeline).toEqual([]);
      expect(step2.history.map((post) => [post.actor, post.text])).toEqual([['support', inquiry]]);
      expect(step2.timeline).toMatchObject([{
        when: 'tests:passed',
        kind: 'post',
        post: { actor: 'support', text: thanks },
      }]);
    });

    it('演習のエディタは、ステップ1が開始コード、ステップ2がテーブルを作り直した後のコードを開く', () => {
      const snapshots = ['chapter-2/02', 'chapter-2/04'].map((id) => {
        const tab = lessonScenarios[id]?.tabs[0];
        if (tab?.kind !== 'editor') throw new Error('エディタのタブがありません');
        return [tab.config.snapshot, tab.config.active, projectFilesOf(tab.config.snapshot)];
      });
      const files = ['db.ts', 'show-visits.ts', 'visits.test.ts', 'visits.ts', 'who-cancelled.ts'];
      expect(snapshots).toEqual([
        ['chapter-1-start', 'visits.ts', files],
        ['chapter-2-step-2-start', 'visits.ts', files],
      ]);
    });

    it('業務イベントの語は、定義を読む 3 ページ目より前の画面の文に含まない', () => {
      for (const id of ['chapter-2/01', 'chapter-2/02']) {
        for (const text of textsOf(lessonScenarios[id] as WorkspaceScenario)) {
          for (const word of ['業務イベント', 'business_events', 'target_']) {
            expect(text, id).not.toContain(word);
          }
        }
      }
    });

    it('5 ページ目は、プルリクエストの差分の設定を持つ', () => {
      const scenario = lessonScenarios['chapter-2/05'];
      const tab = scenario?.tabs[0];
      if (tab?.kind !== 'pr') throw new Error('プルリクエストのタブがありません');
      expect(tab.config.diff).toEqual({
        file: 'visits.ts',
        before: 'chapter-1-start',
        after: 'chapter-2-step-2',
        context: 3,
      });
      expect(tab.config.status).toBe('Open');
      expect(opened(scenario as WorkspaceScenario)).toEqual([['techlead', prSeen], ['techlead', prRemaining]]);
    });
  });

  describe('第3章', () => {
    it('1 ページ目は、問い合わせの履歴と、開いた時点の投稿と、調査メモと返信の設定を持つ', () => {
      const scenario = lessonScenarios['chapter-3/01'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(scenario.history.map((post) => [post.actor, post.text])).toEqual([
        ['support', inquiry],
        ['support', whyNotRecorded],
      ]);
      expect(opened(scenario)).toEqual([['support', otherClinicFirst], ['support', otherClinicSecond]]);
      expect(summary(scenario)).toEqual(['console:console:DB Console', 'guide:doc:SQL の実行手順']);
      expect(scenario.memo?.unknown).toBe('結果を確認してください');
      expect(scenario.memo?.items.map((item) => [item.label, item.read?.field])).toEqual([
        ['誰が', 'operated_by'],
        ['いつ', 'event_at'],
        ['何を', 'event_name'],
        ['なぜ', 'reason'],
      ]);
      expect(scenario.reply?.followUps.map((item) => [item.actor, item.text])).toEqual([['support', answeredThanks]]);
      expect(scenario.reply?.lines).toEqual([{ text: '{operated_by}が、{reason}でキャンセルしてます（{event_at}）' }]);
      expect(scenario.chat.buttons.map((button) => button.label)).toEqual(['調査結果を返信する']);
      const console = scenario.tabs[0];
      if (console?.kind !== 'console') throw new Error('DB Console のタブがありません');
      expect(console.config.storageId).toBe('chapter-3-who-cancelled');
      expect(console.config.setup).toMatchObject({
        kind: 'script',
        exercise: 'chapter-2-step-2',
        entry: 'who-cancelled.ts',
        own: { exercise: 'step-2', file: 'visits.ts', testFile: 'visits.test.ts' },
      });
      expect(console.config.target).toEqual({
        column: 'operated_by',
        value: 'visit-pochi',
        read: ['event_at', 'event_name', 'operated_by', 'reason'],
      });
    });

    it('2 と 3 ページ目は、履歴だけで投稿が無い', () => {
      for (const id of ['chapter-3/02', 'chapter-3/03']) {
        const scenario = lessonScenarios[id];
        if (scenario === undefined) throw new Error(id);
        expect(pairs(scenario), id).toEqual(answered);
        expect(scenario.timeline, id).toEqual([]);
      }
      expect(summary(lessonScenarios['chapter-3/02'] as WorkspaceScenario)).toEqual([
        'memo:doc:who-cancelled.ts の SELECT',
      ]);
      expect(summary(lessonScenarios['chapter-3/03'] as WorkspaceScenario)).toEqual(['memo:doc:実行結果の読み方']);
    });

    it('4 ページ目は、タマの問い合わせが届き、図を最後まで進めると返信できる', () => {
      const scenario = lessonScenarios['chapter-3/04'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(opened(scenario)).toEqual([['support', tamaAsked]]);
      expect(scenario.gates?.reply.requires.map((item) => item.signal)).toEqual([{ name: 'figure:step', key: 'last' }]);
      expect(scenario.reply).toMatchObject({
        lines: [{ text: tamaAnswer }],
        followUps: [{ actor: 'support', text: tamaAcknowledged }],
      });
      expect(scenario.chat.buttons.map((button) => button.label)).toEqual(['返信する']);
      expect(summary(scenario)).toEqual(['memo:doc:記録を足す前に起きたこと']);
    });
  });

  describe('第4章', () => {
    const history = (id: string): (readonly [string, string])[] => {
      const scenario = lessonScenarios[id];
      if (scenario === undefined) throw new Error(id);
      return scenario.history.map((post) => [post.actor, post.text] as const);
    };

    it('1 ページ目は、第3章 4 ページ目の最後のやり取りを履歴に持ち、開いた時点でテックリードが 2 件投稿する', () => {
      const scenario = lessonScenarios['chapter-4/01'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(history('chapter-4/01')).toEqual([
        ['support', tamaAsked],
        ['you', tamaAnswer],
        ['support', tamaAcknowledged],
      ]);
      expect(opened(scenario)).toEqual([['techlead', otherTeams], ['techlead', threeConsultations]]);
      expect(summary(scenario)).toEqual(['memo:doc:相談の一覧']);
      expect(scenario.chat.buttons).toEqual([]);
      expect(scenario.timeline.flatMap((event) => (event.when === undefined ? [] : [event]))).toEqual([]);
    });

    const consultations = [
      {
        id: 'chapter-4/02',
        history: [['techlead', otherTeams], ['techlead', threeConsultations]],
        opened: [['finance', financeGreeting], ['finance', financeAsked]],
        answer: financeAnswer,
        follow: ['finance', financeThanks],
        tabs: [
          'memo:doc:相談1: 集計の件数が合わない',
          'editor:editor:visits.ts — clinic-api',
          'console:console:DB Console',
        ],
        storageId: 'chapter-4-summary-table',
        exercise: 'chapter-4-summary-table-done',
        entry: 'why-this-count.ts',
        sqlHead: 'SELECT\n  c.visit_date,',
      },
      {
        id: 'chapter-4/03',
        history: [
          ['finance', financeGreeting],
          ['finance', financeAsked],
          ['you', financeAnswer],
          ['finance', financeThanks],
        ],
        opened: [['support', reminderGreeting], ['support', reminderAsked]],
        answer: reminderAnswer,
        follow: ['support', reminderThanks],
        tabs: [
          'memo:doc:相談2: 外部への送信が届いたか分からない',
          'editor:editor:visits.ts — clinic-api',
          'console:console:DB Console',
        ],
        storageId: 'chapter-4-external-sync',
        exercise: 'chapter-4-external-sync-done',
        entry: 'what-was-sent.ts',
        sqlHead: 'SELECT\n  requested.target_id AS visit_id,',
      },
      {
        id: 'chapter-4/04',
        history: [
          ['support', reminderGreeting],
          ['support', reminderAsked],
          ['you', reminderAnswer],
          ['support', reminderThanks],
        ],
        opened: [['it', auditGreeting], ['it', auditAsked]],
        answer: auditAnswer,
        follow: ['it', auditThanks],
        tabs: [
          'memo:doc:相談3: 監査ログに理由がない',
          'editor:editor:visits.ts — clinic-api',
          'console:console:DB Console',
        ],
        storageId: 'chapter-4-audit-log',
        exercise: 'chapter-4-audit-log-done',
        entry: 'why-changed.ts',
        sqlHead: 'SELECT\n  a.id AS audit_log_id,',
      },
    ] as const;

    it.each(consultations)(
      '$id は、直前のやり取りを履歴に持ち、相手が 2 件投稿し、コードを実行した合図の後に返信できる',
      (item) => {
        const scenario = lessonScenarios[item.id];
        if (scenario === undefined) throw new Error('筋書きがありません');
        expect(history(item.id)).toEqual(item.history);
        expect(opened(scenario)).toEqual(item.opened);
        expect(summary(scenario)).toEqual(item.tabs);
        expect(scenario.chat.buttons.map((button) => [button.name, button.label])).toEqual([['reply', '返信する']]);
        expect(scenario.gates?.reply.requires.map((requirement) => requirement.signal)).toEqual(['code:run']);
        expect(scenario.reply?.lines).toEqual([{ text: item.answer }]);
        expect(scenario.reply?.followUps.map((followUp) => [followUp.actor, followUp.text])).toEqual([item.follow]);
        expect(scenario.timeline.flatMap((event) => (event.when === undefined ? [] : [event]))).toEqual([]);
      },
    );

    it.each(consultations)(
      '$id の DB Console は、これまでの SQL の欄と同じ保存キー、実行する演習、初期の SQL を持つ',
      (item) => {
        const scenario = lessonScenarios[item.id];
        const console = scenario?.tabs.find((tab) => tab.kind === 'console');
        if (console?.kind !== 'console') throw new Error('DB Console のタブがありません');
        expect(console.config.storageId).toBe(item.storageId);
        expect(console.config.setup).toMatchObject({ kind: 'script', exercise: item.exercise, entry: item.entry });
        expect(console.config.initialSql.startsWith(item.sqlHead)).toBe(true);
        expect(console.config.controls).toBe(true);
        const editor = scenario?.tabs.find((tab) => tab.kind === 'editor');
        if (editor?.kind !== 'editor') throw new Error('エディタのタブがありません');
        expect(editor.config.snapshot).toBe(item.exercise);
        expect(projectFilesOf(editor.config.snapshot)).toEqual(['db.ts', 'visits.test.ts', 'visits.ts', item.entry]);
      },
    );

    it('5 ページ目は、情シスとのやり取りを履歴に持ち、テックリードが 2 件投稿する', () => {
      const scenario = lessonScenarios['chapter-4/05'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(history('chapter-4/05')).toEqual([
        ['it', auditGreeting],
        ['it', auditAsked],
        ['you', auditAnswer],
        ['it', auditThanks],
      ]);
      expect(opened(scenario)).toEqual([['techlead', comparisonMade], ['techlead', chooseOne]]);
      expect(summary(scenario)).toEqual(['memo:doc:3つのパターンの比較']);
    });

    it('6 ページ目は、文書を最初のタブにし、3 つの開始コードを別々のエディタのタブにする', () => {
      const scenario = lessonScenarios['chapter-4/06'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(history('chapter-4/06')).toEqual([['techlead', comparisonMade], ['techlead', chooseOne]]);
      expect(opened(scenario)).toEqual([['techlead', takeHome], ['techlead', startingCodes]]);
      expect(summary(scenario)).toEqual([
        'guide:doc:持ち帰りの演習',
        'summary-table:editor:集計テーブル（chapter-4-summary-table-start）',
        'external-sync:editor:外部システム同期（chapter-4-external-sync-start）',
        'audit-log:editor:既存の監査ログ（chapter-4-audit-log-start）',
      ]);
      expect(scenario.tabs.every((tab) => tab.initial !== false)).toBe(true);
    });
  });

  describe('まとめ', () => {
    it('1 ページ目は、第4章 6 ページ目のテックリードの 2 件を履歴に持ち、開いた時点でテックリードが 2 件投稿する', () => {
      const scenario = lessonScenarios['summary/01'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(pairs({ ...scenario, timeline: [] })).toEqual([['techlead', takeHome], ['techlead', startingCodes]]);
      expect(opened(scenario)).toEqual([['techlead', goodWork], ['techlead', todayMemo]]);
      expect(summary(scenario)).toEqual(['memo:doc:今日やったこと']);
    });

    it('2 ページ目は、1 ページ目のテックリードの 2 件を履歴に持ち、入力欄と文書だけを持つ', () => {
      const scenario = lessonScenarios['summary/02'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(pairs({ ...scenario, timeline: [] })).toEqual([['techlead', goodWork], ['techlead', todayMemo]]);
      expect(opened(scenario)).toEqual([['techlead', decideLast], ['techlead', skipIfNone]]);
      expect(summary(scenario)).toEqual(['memo:doc:持ち帰る手順']);
      expect(scenario.chat.buttons).toEqual([]);
      expect(mdxOf('summary/02')).toMatch(/<Fragment slot="composer">\n<OwnQuestion id="summary-update" /);
    });

    it('実行基盤を使うタブ（console、editor）を置かない', () => {
      for (const id of ['summary/01', 'summary/02']) {
        const scenario = lessonScenarios[id];
        expect(scenario?.tabs.map((tab) => tab.kind), id).toEqual(['doc']);
      }
    });
  });

  it('待つ合図は、すべて決まった合図の名前である', () => {
    for (const [id, scenario] of entries) {
      for (const event of scenario.timeline) {
        if (event.when !== undefined) expect(signalNames, id).toContain(event.when);
      }
    }
  });

  it('使わない語を、画面の文に含まない', () => {
    for (const [id, scenario] of entries) {
      for (const text of textsOf(scenario)) {
        for (
          const word of [
            'Slack',
            'Datadog',
            'GitHub',
            'Claude',
            ['ドメイン', 'イベント'].join(''),
            ['D', 'D', 'D'].join(''),
            ['イベント', 'ソーシング'].join(''),
          ]
        ) {
          expect(text, `${id}`).not.toContain(word);
        }
      }
    }
  });

  it('第1章までは、業務イベント、business_events、target_ を文面に含まない', () => {
    for (const [id, scenario] of entries.filter(([id]) => id.startsWith('chapter-1/'))) {
      for (const text of textsOf(scenario)) {
        for (const word of ['業務イベント', 'business_events', 'target_']) {
          expect(text, `${id}`).not.toContain(word);
        }
      }
    }
  });
});
