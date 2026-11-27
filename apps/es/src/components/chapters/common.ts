import { openingSchedule } from '../../workspace/channel';
import type {
  Actor,
  ChatButton,
  DocConfig,
  EditorConfig,
  Post,
  TabDefinition,
  TimelineEvent,
  WorkspaceScenario,
} from '../../workspace/scenario';

export const inquiryChannel = '# 問い合わせ対応';
export const devChannel = '# dev';
export const handsOnChannel = '# ハンズオン';

export const actors: Readonly<Record<'support' | 'you' | 'techlead' | 'finance' | 'it' | 'kosui', Actor>> = {
  support: { name: 'カスタマーサポート', avatar: 'カ', tone: 'rose' },
  you: { name: 'あなた', avatar: 'あ', tone: 'blue', self: true },
  techlead: { name: 'テックリード', avatar: 'テ', tone: 'violet' },
  finance: { name: '経理', avatar: '経', tone: 'green' },
  it: { name: '情シス', avatar: '情', tone: 'amber' },
  kosui: { name: 'kosui', avatar: 'k', tone: 'slate' },
};

const startedAt = Date.UTC(2026, 10, 9, 9, 30, 0);

export const inquiry: Post = {
  actor: 'support',
  text: 'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？',
  time: '18:20',
};

export const whyNotRecorded: Post = {
  actor: 'support',
  text: 'なんで記録取ってないんですか',
  time: '18:24',
};

export const thanks: Post = {
  actor: 'support',
  text: 'わー、ありがとうございます！これで次からは答えられますね🙏',
};

export const answeredThanks: Post = {
  actor: 'support',
  text: 'はやっ！ありがとうございます、病院さんに伝えます🙏',
};

const lead = (text: string): Post => ({ actor: 'techlead', channel: devChannel, text });
const presenter = (text: string, list?: readonly string[]): Post => ({
  actor: 'kosui',
  channel: handsOnChannel,
  text,
  ...(list === undefined ? {} : { list }),
});
const support = (text: string): Post => ({ actor: 'support', text });
const finance = (text: string): Post => ({ actor: 'finance', text });
const infoSys = (text: string): Post => ({ actor: 'it', text });
const you = (text: string): Post => ({ actor: 'you', text });

export const posts = {
  afterIncident: lead('さっきの件、おつかれさまでした'),
  ownQuestion: presenter(
    '仕事で「これ、誰がいつ変えたの？」「なんでこうなってるの？」と聞かれて、DB を見ても分からなかったことはありませんか？\nそのときにあなたが聞かれた質問を、下の入力欄に1つ書いてみてください。たとえば、こんなのです。',
    [
      'この予約は、誰がキャンセルしましたか。',
      'この金額は、いつ変わりましたか。なぜ変わりましたか。',
      'このアカウントは、なぜ止まっていますか。',
      '先月末の時点では、どうなっていましたか。',
    ],
  ),
  afterOwnQuestion: presenter(
    '質問を書けたら、次のことを考えてみてください。あなたが普段の業務で運用しているシステムは、あなたが書いた質問に答えるための情報を、データベースに保持していますか？\n質問を思いつかない人は、何も書かなくて大丈夫です。何も書かない人は、画面の上の右向きの矢印のボタンを押して、次のページへ進んでください。何も書かなかった人には、この後のページが、質問の代わりに、カスタマーサポートから届いた問い合わせを表示します。ポチの来院を、誰が、いつ、なぜキャンセルしたのかを尋ねる問い合わせです。',
  ),
  wantRecord: lead('再発防止で、キャンセルしたときに記録を残すようにしたいです'),
  runTests: lead('先にテストを書いておいたので、まず流してみてください。いまは4件落ちるはずです'),
  failedFour: lead('落ちた4件が、これから足すところです👍'),
  decisionRecord: lead('方針を ADR にまとめました。ざっと読んでもらえると助かります'),
  tableRecord: lead('記録を1つのテーブルにまとめる案も ADR にしました'),
  prSeen: lead('PR 見ました！差分、思ったより小さいですね'),
  prRemaining: lead('足したあとに残る作業も書いておきます'),
  otherClinicFirst: support('お疲れ様です！別の病院さんから、また同じ問い合わせが来てて…'),
  otherClinicSecond: support('ポチちゃんの来院（visit-pochi）、なんでキャンセルになってるか分かりますか？'),
  tamaAsked: support('あと、タマちゃん（visit-tama）の方もキャンセルの理由わかりますか？'),
  tamaAnswer: { actor: 'you', text: 'タマの方は、記録を足す前のキャンセルなので、理由は残ってないです…' },
  tamaAcknowledged: support('そうなんですね…了解です'),
  staffReply: { actor: 'you', text: '受付スタッフが、飼い主の都合でキャンセルしてます' },
  otherTeams: lead('記録の話、ほかのチームからも相談が来てます'),
  threeConsultations: lead('3つあるので順番に見ていきましょう'),
  pastExperience: presenter(
    '医療SaaSの共通基盤で、既存の顧客基盤に最新状態しか残っておらず、過去のユーザー、店舗、端末、ライセンスの変化を追うことが難しかった経験があります',
  ),
  closestQuestion: presenter('普段の業務で運用しているシステムに近いのはどれか、考えながら見てもらえると'),
  financeGreeting: finance('お疲れ様です。4月1日の診察のキャンセル件数の件で質問です'),
  financeAsked: finance('集計だと3件なんですが、一覧で数えると2件しかなくて…どっちが正しいですか？'),
  financeAnswer: you(
    '集計の3件が正しいと思います。ただ、業務イベントで内訳まで確かめられるのは2件で、残りの1件は業務イベントを入れる前のキャンセルなので確かめられません。業務イベントから正しい件数を出すには、集計に入るキャンセルがすべて業務イベントとして残っている必要があります',
  ),
  financeThanks: finance('なるほど、助かります！'),
  siteGreeting: support('すみません、また1件お願いします🙏'),
  siteAsked: support(
    'コタロウの飼い主さんから、予約サイトではキャンセルになってるのに、こっちでは診察済みになってるって連絡があって…どっちが正しいですか？',
  ),
  siteAnswer: you(
    '取り込みの記録を見ました。予約サイトのキャンセルは届いていて、記録に残ってます。ただ、こっちでは診察が終わっていたので、来院は診察済みのままにしてます',
  ),
  siteThanks: support('ありがとうございます、飼い主さんにそう伝えます！'),
  auditGreeting: infoSys('お疲れ様です、監査対応で確認させてください'),
  auditAsked: infoSys('監査ログに reserved → cancelled の変更は残ってるんですが、理由が載ってなくて。分かりますか？'),
  auditAnswer: you('監査ログと記録を突き合わせると、理由が分かる変更と、分からない変更があります。一覧を出しました'),
  auditThanks: infoSys('ありがとうございます。理由が無い分は別途確認します'),
  comparisonMade: lead('3つを同じ軸で並べた表を作りました'),
  chooseOne: presenter('あなたが普段の業務で運用しているシステムに近いパターンを、1つ選んでみてください'),
  takeHome: lead('時間の関係で、実装は持ち帰りにします'),
  startingCodes: lead('開始コードを3つ置いておくので、選んだパターンで試してみてください'),
  goodWork: lead('おつかれさまでした！'),
  todayMemo: lead('今日やったことを設計メモにまとめました'),
  decideLast: presenter(
    '最後に、あなたが普段の業務で運用しているシステムの更新処理から、記録を足す更新処理を1つ決めて、下の入力欄に書いてみてください',
  ),
  skipIfNone: presenter('答えたい質問が特に無ければ、足さなくて大丈夫です'),
} as const satisfies Record<string, Post>;

export const replyButton = (label: string): readonly ChatButton[] => [{ name: 'reply', label, primary: true }];

type LessonOptions = Pick<WorkspaceScenario, 'id' | 'label' | 'tabs'> & {
  readonly history?: readonly Post[];
  readonly timeline?: readonly TimelineEvent[];
  readonly buttons?: readonly ChatButton[];
  readonly collapsed?: true;
  readonly memo?: WorkspaceScenario['memo'];
  readonly gates?: WorkspaceScenario['gates'];
  readonly reply?: WorkspaceScenario['reply'];
  readonly done?: WorkspaceScenario['done'];
};

const docsOnly = (tabs: readonly TabDefinition[]): boolean => tabs.every((tab) => tab.kind === 'doc');

export const lessonScenario = (options: LessonOptions): WorkspaceScenario => ({
  id: options.id,
  mode: 'untimed',
  label: options.label,
  startedAt,
  status: { label: '作業の状況', elapsed: '', start: '' },
  startGuide: [],
  chat: {
    workspace: 'clinic-dev',
    channels: [
      { name: '# general' },
      { name: devChannel },
      { name: inquiryChannel },
      { name: '# 障害対応' },
      { name: handsOnChannel },
    ],
    channel: inquiryChannel,
    placeholder: `${inquiryChannel} へのメッセージ`,
    buttons: options.buttons ?? [],
    ...(options.collapsed === true || docsOnly(options.tabs) ? { collapsed: true as const } : {}),
  },
  actors,
  history: options.history ?? [],
  timeline: options.timeline ?? [],
  tabs: options.tabs,
  ...(options.memo === undefined ? {} : { memo: options.memo }),
  ...(options.gates === undefined ? {} : { gates: options.gates }),
  ...(options.reply === undefined ? {} : { reply: options.reply }),
  ...(options.done === undefined ? {} : { done: options.done }),
});

export const opening = (...group: readonly Post[]): TimelineEvent[] =>
  openingSchedule(group, inquiryChannel).map(({ post, at }) => ({ at, kind: 'post', post }));

export const documentTab = (key: string, title: string, path: string, config: DocConfig): TabDefinition => ({
  key,
  kind: 'doc',
  title,
  label: '社内の文書',
  url: `https://docs.internal.example/${path}`,
  favicon: { tone: 'blue', shape: 'square' },
  config,
});

export const docTab = (key: string, title: string, path: string, approvable = false): TabDefinition =>
  documentTab(key, title, path, {
    title,
    updatedAt: '2026-11-09',
    updatedBy: 'テックリード',
    ...(approvable ? { approvable } : {}),
  });

export const editorTab = (
  key: string,
  active: string,
  config: Pick<EditorConfig, 'snapshot'> & Partial<EditorConfig>,
  name?: { readonly title: string; readonly directory: string },
): TabDefinition => ({
  key,
  kind: 'editor',
  title: name?.title ?? `${active} — clinic-api`,
  label: 'エディタ',
  url: `https://ide.internal.example/${name?.directory ?? 'clinic-api'}/${active}`,
  favicon: { tone: 'azure', shape: 'rounded' },
  config: { project: 'clinic-api', branch: 'record-cancellation', active, ...config },
});
