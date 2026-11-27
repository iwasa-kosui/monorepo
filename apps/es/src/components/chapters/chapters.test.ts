import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { projectFilesOf } from '../../lib/snapshots';
import { channelOfPost, openingChannel, typingStartMs } from '../../workspace/channel';
import { type Post, signalNames, type WorkspaceScenario } from '../../workspace/scenario';
import { scenarioProblems } from '../../workspace/validate';
import { evidenceScenario } from '../intro/evidence-scenario';
import { incidentScenario } from '../intro/incident-scenario';
import { devChannel, handsOnChannel, inquiryChannel } from './common';
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

const postsOf = (scenario: WorkspaceScenario): Post[] => [
  ...scenario.history,
  ...scenario.timeline.flatMap((event) => (event.kind === 'post' ? [event.post] : [])),
];

const allScenarios: readonly (readonly [string, WorkspaceScenario])[] = [
  ...entries,
  ['intro/incident', incidentScenario],
  ['intro/evidence', evidenceScenario],
];

type Spoken = { readonly where: string; readonly actor: string; readonly text: string; readonly channel: string };

const spokenOf = (scenario: WorkspaceScenario): Spoken[] => [
  ...scenario.history.map((post, index) => ({
    where: `history[${index}]`,
    actor: post.actor,
    text: post.text,
    channel: channelOfPost(post, scenario.chat.channel),
  })),
  ...scenario.timeline.flatMap((event, index) =>
    event.kind === 'post'
      ? [{
        where: `timeline[${index}]`,
        actor: event.post.actor,
        text: event.post.text,
        channel: channelOfPost(event.post, scenario.chat.channel),
      }]
      : []
  ),
  ...(scenario.reply?.followUps ?? []).map((followUp, index) => ({
    where: `reply.followUps[${index}]`,
    actor: followUp.actor,
    text: followUp.text,
    channel: scenario.chat.channel,
  })),
];

const channelProblems = (id: string, scenario: WorkspaceScenario): string[] => {
  const nameOf = (actor: string): string => scenario.actors[actor]?.name ?? actor;
  const expectedChannel = (actor: string): string =>
    nameOf(actor) === 'テックリード' ? devChannel : nameOf(actor) === 'kosui' ? handsOnChannel : scenario.chat.channel;
  const problems: string[] = [];
  for (const item of spokenOf(scenario)) {
    const head = `${id} ${item.where} ${nameOf(item.actor)}「${item.text.slice(0, 16)}」`;
    const expected = expectedChannel(item.actor);
    if (item.channel !== expected) problems.push(`${head}は「${item.channel}」にあるが、「${expected}」にあるべき`);
    if (item.channel === devChannel && nameOf(item.actor) !== 'テックリード') {
      problems.push(`${head}は「${devChannel}」にあるが、テックリード以外の発言者である`);
    }
    if (item.channel === inquiryChannel && ['テックリード', 'kosui'].includes(nameOf(item.actor))) {
      problems.push(`${head}は「${inquiryChannel}」にあるが、${nameOf(item.actor)}の発言である`);
    }
  }
  const hasTechlead = spokenOf(scenario).some((item) => nameOf(item.actor) === 'テックリード');
  if (hasTechlead && !scenario.chat.channels.some((channel) => channel.name === devChannel)) {
    problems.push(`${id} はテックリードの発言があるが、chat.channels に「${devChannel}」がない`);
  }
  return problems;
};

const summary = (scenario: WorkspaceScenario): string[] =>
  scenario.tabs.map((tab) => `${tab.key}:${tab.kind}:${tab.title}`);

const inquiry = 'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？';
const whyNotRecorded = 'なんで記録取ってないんですか';
const afterIncident = 'さっきの件、おつかれさまでした';
const ownQuestion =
  '仕事で「これ、誰がいつ変えたの？」「なんでこうなってるの？」と聞かれて、DB を見ても分からなかったことはありませんか？\nそのときにあなたが聞かれた質問を、下の入力欄に1つ書いてみてください。たとえば、こんなのです。';
const afterOwnQuestion =
  '質問を書けたら、次のことを考えてみてください。あなたが普段の業務で運用しているシステムは、あなたが書いた質問に答えるための情報を、データベースに保持していますか？\n質問を思いつかない人は、何も書かなくて大丈夫です。何も書かない人は、画面の上の右向きの矢印のボタンを押して、次のページへ進んでください。何も書かなかった人には、この後のページが、質問の代わりに、カスタマーサポートから届いた問い合わせを表示します。ポチの来院を、誰が、いつ、なぜキャンセルしたのかを尋ねる問い合わせです。';
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
const threeConsultations = '3つあるので順番に見ていきましょう';
const pastExperience =
  '医療SaaSの共通基盤で、既存の顧客基盤に最新状態しか残っておらず、過去のユーザー、店舗、端末、ライセンスの変化を追うことが難しかった経験があります';
const closestQuestion = '普段の業務で運用しているシステムに近いのはどれか、考えながら見てもらえると';
const financeGreeting = 'お疲れ様です。昨日のキャンセル件数の件で質問です';
const financeAsked = '集計だと3件なんですが、一覧で数えると2件しかなくて…どっちが正しいですか？';
const financeAnswer =
  '集計の3件が正しいと思います。ただ、業務イベントで内訳まで確かめられるのは2件で、残りの1件は業務イベントを入れる前のキャンセルなので確かめられません。業務イベントから正しい件数を出すには、導入前のキャンセルも業務イベントとして残す必要があります';
const financeThanks = 'なるほど、助かります！';
const siteGreeting = 'すみません、また1件お願いします🙏';
const siteAsked =
  'コタロウの飼い主さんから、予約サイトではキャンセルになってるのに、こっちでは診察済みになってるって連絡があって…どっちが正しいですか？';
const siteAnswer =
  '取り込みの記録を見ました。予約サイトのキャンセルは届いてますが、届いたのが診察の後だったので取り込んでいません';
const siteThanks = 'ありがとうございます、飼い主さんにそう伝えます！';
const auditGreeting = 'お疲れ様です、監査対応で確認させてください';
const auditAsked = '監査ログに reserved → cancelled の変更は残ってるんですが、理由が載ってなくて。分かりますか？';
const auditAnswer = '監査ログと記録を突き合わせると、理由が分かる変更と、分からない変更があります。一覧を出しました';
const auditThanks = 'ありがとうございます。理由が無い分は別途確認します';
const comparisonMade = '3つを同じ軸で並べた表を作りました';
const chooseOne = 'あなたが普段の業務で運用しているシステムに近いパターンを、1つ選んでみてください';
const takeHome = '時間の関係で、実装は持ち帰りにします';
const startingCodes = '開始コードを3つ置いておくので、選んだパターンで試してみてください';
const goodWork = 'おつかれさまでした！';
const todayMemo = '今日やったことを設計メモにまとめました';
const decideLast =
  '最後に、あなたが普段の業務で運用しているシステムの更新処理から、記録を足す更新処理を1つ決めて、下の入力欄に書いてみてください';
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
  ['kosui', ownQuestion],
  ['kosui', afterOwnQuestion],
  ['techlead', wantRecord],
  ['techlead', runTests],
  ['techlead', failedFour],
];

const chapter4Texts = [
  otherTeams,
  threeConsultations,
  pastExperience,
  closestQuestion,
  financeGreeting,
  financeAsked,
  financeAnswer,
  financeThanks,
  siteGreeting,
  siteAsked,
  siteAnswer,
  siteThanks,
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

const timedPostsOf = (scenario: WorkspaceScenario): { readonly at: number; readonly channel: string }[] =>
  scenario.timeline.flatMap((event) =>
    event.at !== undefined && event.kind === 'post'
      ? [{ at: event.at, channel: event.post.channel ?? scenario.chat.channel }]
      : []
  );

describe('第1章から第4章とまとめの筋書き', () => {
  it('19 ページ分あり、章のページと同じ ID を持つ', () => {
    expect(Object.keys(lessonScenarios)).toEqual([
      'chapter-1/02',
      'chapter-1/03',
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

  it('発言者は、カスタマーサポート、あなた、テックリード、経理、情シス、kosui の 6 人で、頭文字と色が異なる', () => {
    for (const [, scenario] of entries) {
      const actors = Object.values(scenario.actors);
      expect(actors.map((actor) => [actor.name, actor.avatar, actor.tone])).toEqual([
        ['カスタマーサポート', 'カ', 'rose'],
        ['あなた', 'あ', 'blue'],
        ['テックリード', 'テ', 'violet'],
        ['経理', '経', 'green'],
        ['情シス', '情', 'amber'],
        ['kosui', 'k', 'slate'],
      ]);
      expect(new Set(actors.map((actor) => actor.avatar)).size).toBe(6);
      expect(new Set(actors.map((actor) => actor.tone)).size).toBe(6);
      expect(Object.values(scenario.actors).filter((actor) => actor.self === true).map((actor) => actor.name)).toEqual([
        'あなた',
      ]);
    }
  });

  it('導入の 2 つの筋書きの発言者は、表示名で固定する', () => {
    expect(Object.values(incidentScenario.actors).map((actor) => actor.name)).toEqual(['カスタマーサポート', 'あなた']);
    expect(Object.values(evidenceScenario.actors).map((actor) => actor.name)).toEqual([
      'カスタマーサポート',
      'あなた',
      'テックリード',
      '経理',
      '情シス',
      'kosui',
    ]);
  });

  it('導入の発言者の名前と頭文字を引き継ぐ', () => {
    const [, first] = entries[0] ?? [];
    expect(first?.actors['support']).toEqual(incidentScenario.actors['support']);
    expect(first?.actors['you']).toEqual(incidentScenario.actors['you']);
  });

  it('既定のチャンネルは「# 問い合わせ対応」で、一覧の末尾に「# ハンズオン」がある', () => {
    for (const [, scenario] of entries) {
      expect(scenario.chat.channel).toBe('# 問い合わせ対応');
      expect(scenario.chat.channels.map((channel) => channel.name).at(-1)).toBe('# ハンズオン');
    }
  });

  it('テックリードの発言は「# dev」、kosui の発言は「# ハンズオン」、他の発言者の発言は既定のチャンネルに出る', () => {
    expect(allScenarios.flatMap(([id, scenario]) => channelProblems(id, scenario))).toEqual([]);
  });

  describe('発言のチャンネルの検査は、誤った筋書きを検出する', () => {
    const base = lessonScenarios['chapter-3/01'];
    if (base === undefined) throw new Error('筋書きがありません');
    const followUp = { actor: 'support', delay: 1.2, text: answeredThanks };

    it('返信の発言者がテックリードだと、既定のチャンネルに出てしまうので検出する', () => {
      const wrong: WorkspaceScenario = {
        ...base,
        reply: { lines: [], followUps: [{ ...followUp, actor: 'techlead' }] },
      };
      const problems = channelProblems('wrong', wrong);
      expect(problems).toHaveLength(2);
      expect(problems[0]).toBe(
        `wrong reply.followUps[0] テックリード「${
          answeredThanks.slice(0, 16)
        }」は「${inquiryChannel}」にあるが、「${devChannel}」にあるべき`,
      );
    });

    it('テックリードの発言がチャンネルを指定していないと、検出する', () => {
      const wrong: WorkspaceScenario = { ...base, history: [{ actor: 'techlead', text: afterIncident }] };
      expect(channelProblems('wrong', wrong)[0]).toContain(
        `wrong history[0] テックリード「${afterIncident}」は「${inquiryChannel}」にある`,
      );
    });

    it('テックリード以外の発言が「# dev」にあると、検出する', () => {
      const wrong: WorkspaceScenario = { ...base, history: [{ actor: 'support', channel: devChannel, text: inquiry }] };
      expect(channelProblems('wrong', wrong)).toHaveLength(2);
    });

    it('テックリードの発言があるのに、チャンネルの一覧に「# dev」がないと、検出する', () => {
      const wrong: WorkspaceScenario = {
        ...base,
        history: [{ actor: 'techlead', channel: devChannel, text: afterIncident }],
        chat: { ...base.chat, channels: base.chat.channels.filter((channel) => channel.name !== devChannel) },
      };
      expect(channelProblems('wrong', wrong)).toEqual([
        `wrong はテックリードの発言があるが、chat.channels に「${devChannel}」がない`,
      ]);
    });
  });

  it('開いた時点で届く発言があるページは、開いた時点のチャンネルがその最初の発言のチャンネルである', () => {
    for (const [id, scenario] of allScenarios) {
      const first = timedPostsOf(scenario).find((post) => post.at === 0);
      expect(openingChannel(scenario.timeline, scenario.chat.channel), id).toBe(
        first === undefined ? scenario.chat.channel : first.channel,
      );
    }
  });

  it('第1章 3 ページ目は、テックリードの発言で始まるので、開いた時点のチャンネルが「# dev」である', () => {
    const scenario = lessonScenarios['chapter-1/03'];
    if (scenario === undefined) throw new Error('筋書きがありません');
    expect(openingChannel(scenario.timeline, scenario.chat.channel)).toBe(devChannel);
  });

  it('参加者への問いかけ 6 件と、第4章の経験の 1 件だけが kosui の発言である', () => {
    const asked = new Set([
      ownQuestion,
      afterOwnQuestion,
      pastExperience,
      closestQuestion,
      chooseOne,
      decideLast,
      skipIfNone,
    ]);
    const found = new Set<string>();
    for (const [, scenario] of entries) {
      for (const post of postsOf(scenario)) {
        if (asked.has(post.text)) found.add(post.text);
        expect(post.actor === 'kosui', post.text).toBe(asked.has(post.text));
      }
    }
    expect(found).toEqual(asked);
  });

  it('折りたたむのは、演習の 2 ページと、タブが文書だけのページ', () => {
    const docsOnly = entries
      .filter(([, scenario]) => scenario.tabs.every((tab) => tab.kind === 'doc'))
      .map(([id]) => id);
    expect(docsOnly).toEqual([
      'chapter-1/02',
      'chapter-2/01',
      'chapter-2/03',
      'chapter-3/02',
      'chapter-3/03',
      'chapter-3/04',
      'chapter-4/01',
      'chapter-4/05',
      'summary/01',
      'summary/02',
    ]);
    expect(entries.filter(([, scenario]) => scenario.chat.collapsed === true).map(([id]) => id).sort()).toEqual(
      ['chapter-2/02', 'chapter-2/04', ...docsOnly].sort(),
    );
  });

  it('返信の後のカスタマーサポートの発言は 0.6 秒で届き、経理と情シスの発言は 1.2 秒で届く', () => {
    const followUpDelays = (id: string): (number | undefined)[] =>
      lessonScenarios[id]?.reply?.followUps.map((item) => item.delay) ?? [];
    for (const id of ['chapter-3/01', 'chapter-3/04', 'chapter-4/03']) {
      expect(followUpDelays(id), id).toEqual([0.6]);
    }
    for (const id of ['chapter-4/02', 'chapter-4/04']) {
      expect(followUpDelays(id), id).toEqual([1.2]);
    }
  });

  it('テストが通った後のカスタマーサポートの発言は 0.6 秒で届く', () => {
    const posted = lessonScenarios['chapter-2/04']?.timeline.filter(
      (event) => event.kind === 'post' && event.when === 'tests:passed',
    );
    expect(posted).toHaveLength(1);
    expect(posted?.[0]?.kind === 'post' && posted[0].delay).toBe(0.6);
  });

  it('投稿の文は、定めた文だけである', () => {
    const allowed = new Set([
      inquiry,
      whyNotRecorded,
      afterIncident,
      ownQuestion,
      afterOwnQuestion,
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
        for (const text of [post.text, ...(post.list ?? [])]) {
          for (const sentence of sentences) {
            expect(text, `${id}: ${sentence}`).not.toContain(sentence);
          }
        }
      }
    }
  });

  it('投稿に使う絵文字は、定めた文面のものだけである', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const [id, scenario] of entries) {
      for (const post of postsOf(scenario)) {
        if (emoji.test(post.text)) {
          expect([failedFour, thanks, answeredThanks, siteGreeting], id).toContain(post.text);
        }
      }
    }
  });

  it('開いた時点の投稿は、同じチャンネルでは 2 秒おき、チャンネルが変わるときは 4.5 秒おきに 1 件ずつ届く', () => {
    for (const [id, scenario] of entries) {
      const timed = timedPostsOf(scenario);
      const expected = timed.reduce<number[]>((times, item, index) => {
        const previous = index === 0 ? item.channel : timed[index - 1]?.channel;
        const gap = item.channel === previous ? 2 : 4.5;
        const last = times[index - 1];
        return [...times, last === undefined ? (gap === 2 ? 0 : gap) : last + gap];
      }, []);
      expect(openedAt(scenario), id).toEqual(expected);
    }
  });

  it('チャンネルが切り替わる前の発言は、表示されてから 3 秒以上見える', () => {
    for (const [id, scenario] of entries) {
      const timed = timedPostsOf(scenario);
      timed.forEach((item, index) => {
        const previous = timed[index - 1];
        if (previous === undefined || previous.channel === item.channel) return;
        expect(typingStartMs(item.at) - previous.at * 1000, `${id}[${index}]`).toBeGreaterThanOrEqual(3000);
      });
    }
  });

  describe('第1章', () => {
    it('2 ページ目は、導入のやり取りを履歴に持ち、開いた時点でテックリードが 1 件、kosui が 2 件投稿する', () => {
      const scenario = lessonScenarios['chapter-1/02'];
      expect(scenario).toBeDefined();
      if (scenario === undefined) return;
      expect(scenario.history.map((post) => [post.actor, post.text])).toEqual([
        ['support', inquiry],
        ['support', whyNotRecorded],
      ]);
      expect(opened(scenario)).toEqual([
        ['techlead', afterIncident],
        ['kosui', ownQuestion],
        ['kosui', afterOwnQuestion],
      ]);
      expect(summary(scenario)).toEqual(['memo:doc:データ変更の記録について']);
      const question = postsOf(scenario).find((post) => post.text === ownQuestion);
      expect(question?.list).toEqual([
        'この予約は、誰がキャンセルしましたか。',
        'この金額は、いつ変わりましたか。なぜ変わりましたか。',
        'このアカウントは、なぜ止まっていますか。',
        '先月末の時点では、どうなっていましたか。',
      ]);
    });

    it('3 ページ目は、2 ページ目の投稿を履歴に持ち、テスト実行の合図で投稿する', () => {
      const scenario = lessonScenarios['chapter-1/03'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(scenario.history.map((post) => [post.actor, post.text])).toEqual([
        ['support', inquiry],
        ['support', whyNotRecorded],
        ['techlead', afterIncident],
        ['kosui', ownQuestion],
        ['kosui', afterOwnQuestion],
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
        'memo:doc:ADR 1: キャンセルの記録を、来院の更新と同じトランザクションで追記する',
      ]);
      expect(summary(lessonScenarios['chapter-2/02'] as WorkspaceScenario)).toEqual([
        'editor:editor:visits.ts — clinic-api',
      ]);
      expect(summary(lessonScenarios['chapter-2/03'] as WorkspaceScenario)).toEqual([
        'memo:doc:ADR 2: 出来事ごとの記録を、1つのテーブルにまとめる',
        'explain:doc:3つの列を関数にたとえる',
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

    it('1 ページ目は、第3章 4 ページ目の最後のやり取りを履歴に持ち、開いた時点でテックリードが 2 件、kosui が 2 件投稿する', () => {
      const scenario = lessonScenarios['chapter-4/01'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(history('chapter-4/01')).toEqual([
        ['support', tamaAsked],
        ['you', tamaAnswer],
        ['support', tamaAcknowledged],
      ]);
      expect(opened(scenario)).toEqual([
        ['techlead', otherTeams],
        ['techlead', threeConsultations],
        ['kosui', pastExperience],
        ['kosui', closestQuestion],
      ]);
      expect(summary(scenario)).toEqual(['memo:doc:相談の一覧']);
      expect(scenario.chat.buttons).toEqual([]);
      expect(scenario.timeline.flatMap((event) => (event.when === undefined ? [] : [event]))).toEqual([]);
    });

    const consultations = [
      {
        id: 'chapter-4/02',
        history: [['techlead', otherTeams], ['techlead', threeConsultations], ['kosui', pastExperience], [
          'kosui',
          closestQuestion,
        ]],
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
        opened: [['support', siteGreeting], ['support', siteAsked]],
        answer: siteAnswer,
        follow: ['support', siteThanks],
        tabs: [
          'memo:doc:相談2: 予約サイトのキャンセルが反映されたか分からない',
          'editor:editor:visits.ts — clinic-api',
          'console:console:DB Console',
        ],
        storageId: 'chapter-4-external-sync',
        exercise: 'chapter-4-external-sync-done',
        entry: 'what-was-imported.ts',
        sqlHead: 'SELECT\n  received.target_id AS visit_id,',
      },
      {
        id: 'chapter-4/04',
        history: [
          ['support', siteGreeting],
          ['support', siteAsked],
          ['you', siteAnswer],
          ['support', siteThanks],
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

    it('5 ページ目は、情シスとのやり取りを履歴に持ち、開いた時点でテックリードと kosui が 1 件ずつ投稿する', () => {
      const scenario = lessonScenarios['chapter-4/05'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(history('chapter-4/05')).toEqual([
        ['it', auditGreeting],
        ['it', auditAsked],
        ['you', auditAnswer],
        ['it', auditThanks],
      ]);
      expect(opened(scenario)).toEqual([['techlead', comparisonMade], ['kosui', chooseOne]]);
      expect(summary(scenario)).toEqual(['memo:doc:3つのパターンの比較']);
    });

    it('6 ページ目は、文書を最初のタブにし、3 つの開始コードを別々のエディタのタブにする', () => {
      const scenario = lessonScenarios['chapter-4/06'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(history('chapter-4/06')).toEqual([['techlead', comparisonMade], ['kosui', chooseOne]]);
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
      expect(summary(scenario)).toEqual(['memo:doc:本日の実施内容']);
    });

    it('2 ページ目は、1 ページ目のテックリードの 2 件を履歴に持ち、開いた時点で kosui が 2 件投稿し、入力欄と文書だけを持つ', () => {
      const scenario = lessonScenarios['summary/02'];
      if (scenario === undefined) throw new Error('筋書きがありません');
      expect(pairs({ ...scenario, timeline: [] })).toEqual([['techlead', goodWork], ['techlead', todayMemo]]);
      expect(opened(scenario)).toEqual([['kosui', decideLast], ['kosui', skipIfNone]]);
      expect(summary(scenario)).toEqual(['memo:doc:持ち帰る手順']);
      expect(scenario.chat.buttons).toEqual([]);
      expect(mdxOf('summary/02')).toMatch(/<Fragment slot="composer">\n<OwnQuestion id="summary-update" /);
    });

    it('第4章 5 ページ目で選んだパターンを入力欄に書き、まとめの 2 ページ目がその内容を表示する', () => {
      expect(mdxOf('chapter-4/05')).toContain('<OwnQuestion id="chapter-4"');
      expect(mdxOf('summary/02')).toContain('<OwnQuestionView id="chapter-4"');
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
