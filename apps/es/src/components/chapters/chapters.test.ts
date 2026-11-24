import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
      ? [tab.config.project, ...tab.config.files]
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
const designMemo = '方針を設計メモにまとめました。ざっと読んでもらえると助かります';
const checkRollback = '記録の書き込みに失敗したとき、来院の更新がどうなるか、一回試してみてください';
const columnsMemo = '記録の列も設計メモに足しました';
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

const pairs = (scenario: WorkspaceScenario): (readonly [string, string])[] =>
  postsOf(scenario).map((post) => [post.actor, post.text] as const);

const opened = (scenario: WorkspaceScenario): (readonly [string, string])[] =>
  scenario.timeline.flatMap((
    event,
  ) => (event.at !== undefined && event.kind === 'post' ? [[event.post.actor, event.post.text] as const] : []));

const openedAt = (scenario: WorkspaceScenario): (number | undefined)[] =>
  scenario.timeline.flatMap((event) => (event.at !== undefined && event.kind === 'post' ? [event.at] : []));

describe('第1章から第3章の筋書き', () => {
  it('12 ページ分あり、章のページと同じ ID を持つ', () => {
    expect(Object.keys(lessonScenarios)).toEqual([
      'chapter-1/01',
      'chapter-1/02',
      'chapter-2/01',
      'chapter-2/02',
      'chapter-2/03',
      'chapter-2/04',
      'chapter-2/05',
      'chapter-2/06',
      'chapter-3/01',
      'chapter-3/02',
      'chapter-3/03',
      'chapter-3/04',
    ]);
    expect(new Set(entries.map(([, scenario]) => scenario.id)).size).toBe(12);
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

  it('発言者は、カスタマーサポート、あなた、テックリードの 3 人で、頭文字と色が異なる', () => {
    for (const [, scenario] of entries) {
      expect(Object.values(scenario.actors).map((actor) => [actor.name, actor.avatar, actor.tone])).toEqual([
        ['カスタマーサポート', 'カ', 'rose'],
        ['あなた', 'あ', 'blue'],
        ['テックリード', 'テ', 'violet'],
      ]);
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
      'chapter-2/04',
      'chapter-2/05',
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
      designMemo,
      checkRollback,
      columnsMemo,
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
          expect([failedFour, thanks, answeredThanks], id).toContain(post.text);
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
    it('1 から 3 ページ目は、それまでの投稿を履歴に持ち、テックリードが1件投稿する', () => {
      const expected: [string, readonly (readonly [string, string])[], string][] = [
        ['chapter-2/01', earlier, designMemo],
        ['chapter-2/02', [...earlier, ['techlead', designMemo]], checkRollback],
        ['chapter-2/03', [...earlier, ['techlead', designMemo], ['techlead', checkRollback]], columnsMemo],
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
        'memo:doc:設計メモ: 更新処理の中で記録する',
      ]);
      expect(summary(lessonScenarios['chapter-2/02'] as WorkspaceScenario)).toEqual([
        'editor:editor:fail-record.ts — clinic-api',
        'guide:doc:確認の手順: 記録に失敗したとき',
      ]);
      expect(summary(lessonScenarios['chapter-2/03'] as WorkspaceScenario)).toEqual(['memo:doc:設計メモ: 記録の列']);
      expect(summary(lessonScenarios['chapter-2/04'] as WorkspaceScenario)).toEqual([
        'editor:editor:visits.ts — clinic-api',
      ]);
      expect(summary(lessonScenarios['chapter-2/06'] as WorkspaceScenario)).toEqual([
        'pr:pr:キャンセルの記録を足す',
      ]);
    });

    it('演習の 2 ページは、導入の問い合わせを履歴に持ち、5 ページ目だけテスト成功の合図で礼を投稿する', () => {
      const step1 = lessonScenarios['chapter-2/04'];
      const step2 = lessonScenarios['chapter-2/05'];
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

    it('6 ページ目は、プルリクエストの差分の設定を持つ', () => {
      const scenario = lessonScenarios['chapter-2/06'];
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
        own: { exercise: 'chapter-1-start', file: 'visits.ts', testFile: 'visits.test.ts' },
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
