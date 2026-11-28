import { openingSchedule } from '../../workspace/channel';
import type {
  Actor,
  ChatButton,
  DocChoice,
  DocConfig,
  EditorConfig,
  LiveConfig,
  Post,
  TabDefinition,
  TimelineEvent,
  WorkspaceScenario,
} from '../../workspace/scenario';

export const inquiryChannel = '# 問い合わせ対応';
export const devChannel = '# dev';
export const handsOnChannel = '# ハンズオン';

export const actors: Readonly<Record<'support' | 'you' | 'colleague' | 'finance' | 'it' | 'kosui', Actor>> = {
  support: { name: 'カスタマーサポート', avatar: 'カ', tone: 'rose' },
  you: { name: 'あなた', avatar: 'あ', tone: 'blue', self: true },
  colleague: { name: '同僚', avatar: '同', tone: 'violet' },
  finance: { name: '経理', avatar: '経', tone: 'green' },
  it: { name: '情シス', avatar: '情', tone: 'amber' },
  kosui: { name: 'kosui', avatar: 'k', tone: 'slate' },
};

const startedAt = Date.UTC(2026, 10, 9, 9, 30, 0);

export const incidentDay = '11月6日（金）';

export const inquiry: Post = {
  actor: 'support',
  text: 'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？',
  time: '18:20',
  day: incidentDay,
};

export const whyNotRecorded: Post = {
  actor: 'support',
  text: 'なんで記録取ってないんですか',
  time: '18:24',
  day: incidentDay,
};

export const thanks: Post = {
  actor: 'support',
  text: 'わー、ありがとうございます！これで次からは答えられますね🙏',
};

export const answeredThanks: Post = {
  actor: 'support',
  text: 'はやっ！ありがとうございます、病院さんに伝えます🙏',
};

const colleague = (text: string): Post => ({ actor: 'colleague', channel: devChannel, text });
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
  afterIncident: colleague('さっきの件、おつかれさまでした'),
  ownQuestion: presenter(
    '仕事で「これ、誰がいつ変えたの？」「なんでこうなってるの？」と聞かれて、DB を見ても分からなかったことはありませんか？\nそのときにあなたが聞かれた質問を、下の入力欄に1つ書いて、送ってみてください。たとえば、こんなのです。',
    [
      'この予約は、誰がキャンセルしましたか。',
      'この金額は、いつ変わりましたか。なぜ変わりましたか。',
      'このアカウントは、なぜ止まっていますか。',
      '先月末の時点では、どうなっていましたか。',
    ],
  ),
  afterOwnQuestion: presenter(
    '質問を送れたら、次のことを考えてみてください。あなたが普段の業務で運用しているシステムは、あなたが書いた質問に答えるための情報を、データベースに保持していますか？\n質問を思いつかない人は、何も書かなくて大丈夫です。何も書かない人は、画面の上の右向きの矢印のボタンを押して、次のページへ進んでください。何も送らなかった人には、この後のページが、質問の代わりに、カスタマーサポートから届いた問い合わせを表示します。ポチの来院を、誰が、いつ、なぜキャンセルしたのかを尋ねる問い合わせです。',
  ),
  wantRecord: colleague('再発防止で、キャンセルしたときに記録を残すようにしたいです'),
  runTests: colleague('先にテストを書いておいたので、まず流してみてください。いまは4件落ちるはずです'),
  failedFour: colleague('落ちた4件が、これから足すところです👍'),
  prRequested: colleague(
    'キャンセルの記録をどう残すか、ADR にまとめてプルリクエストを出してもらえますか。叩き台は、コーディングエージェントに作らせて大丈夫です',
  ),
  reviewCommented: colleague('プルリクエストにコメントしました。見てもらえますか'),
  reviewApproved: colleague('プルリクエストを Approve しました。この案で進めます'),
  tableRecord: colleague('記録を1つのテーブルにまとめる案も ADR にしました'),
  prSeen: colleague('PR 見ました！差分、思ったより小さいですね'),
  prRemaining: colleague('足したあとに残る作業も書いておきます'),
  otherClinicFirst: support('お疲れ様です！別の病院さんから、また同じ問い合わせが来てて…'),
  otherClinicSecond: support('ポチちゃんの来院（visit-pochi）、なんでキャンセルになってるか分かりますか？'),
  tamaAsked: support('あと、タマちゃん（visit-tama）の方もキャンセルの理由わかりますか？'),
  tamaAnswer: { actor: 'you', text: 'タマの方は、記録を足す前のキャンセルなので、理由は残ってないです…' },
  tamaAcknowledged: support('そうなんですね…了解です'),
  staffReply: { actor: 'you', text: '受付スタッフが、飼い主の都合でキャンセルしてます' },
  otherTeams: colleague('記録の話、ほかのチームからも相談が来てます'),
  threeConsultations: colleague('3つあるので順番に見ていきましょう'),
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
  migrateOldData: colleague(
    '古いデータについても、VisitMigrated のようなイベントを作って、イベントテーブルに取り込んでおいた方がいいですよ',
  ),
  migrationRecord: colleague('ADR 3 にまとめました。ざっと読んでもらえると助かります'),
  secondConsultation: colleague('2つ目は、カスタマーサポートからの相談です'),
  siteGreeting: support('すみません、また1件お願いします🙏'),
  siteAsked: support(
    'コタロウの飼い主さんから、予約サイトではキャンセルになってるのに、こっちでは診察済みになってるって連絡があって…どっちが正しいですか？',
  ),
  siteAnswer: you(
    'こっちの診察済みが正しいです。予約サイトのキャンセルは届いていて、記録に残ってます。ただ、診察が終わった来院だったので、状態は変えていません',
  ),
  siteThanks: support('ありがとうございます、飼い主さんにそう伝えます！'),
  externalSyncMigration: colleague(
    '導入前に予約サイトから届いたキャンセルは、取り込みの記録に出てきません。ADR 3 のとおり VisitMigrated で取り込んでも、予約サイトから来たのか、いつ届いたのかは分からないままです',
  ),
  externalSyncRecord: colleague('ADR 4 にまとめました。ざっと読んでもらえると助かります'),
  thirdConsultation: colleague('3つ目は、情シスからの相談です'),
  auditGreeting: infoSys('お疲れ様です、監査対応で確認させてください'),
  auditAsked: infoSys('監査ログに reserved → cancelled の変更は残ってるんですが、理由が載ってなくて。分かりますか？'),
  auditAnswer: you('監査ログと記録を突き合わせると、理由が分かる変更と、分からない変更があります。一覧を出しました'),
  auditThanks: infoSys('ありがとうございます。理由が無い分は別途確認します'),
  auditLogMigration: colleague(
    '導入前の監査ログの変更は、業務イベントが無いので理由が分かりません。ADR 3 のとおり VisitMigrated で取り込んでも、監査ログに無い理由は埋まりません',
  ),
  auditLogRecord: colleague('ADR 5 にまとめました。ざっと読んでもらえると助かります'),
  comparisonMade: colleague('3つを同じ軸で並べた表を作りました'),
  chooseOne: presenter('あなたが普段の業務で運用しているシステムに近いパターンを、1つ選んでみてください'),
  takeHome: colleague('時間の関係で、実装は持ち帰りにします'),
  startingCodes: colleague('開始コードを3つ置いておくので、選んだパターンで試してみてください'),
  goodWork: colleague('おつかれさまでした！'),
  todayMemo: colleague('今日やったことを設計メモにまとめました'),
  decideLast: presenter(
    '最後に、あなたが普段の業務で運用しているシステムの更新処理から、記録を足す更新処理を1つ決めて、下の入力欄に書いて、送ってみてください',
  ),
  skipIfNone: presenter('答えたい質問が特に無ければ、足さなくて大丈夫です'),
} as const satisfies Record<string, Post>;

const askAgain = 'ほかの案も見て、もう一度選んでもらえますか';

export const adrReviews: Readonly<Record<string, readonly string[]>> = {
  'append-in-update': [
    '同じ意見です。この案で進めます',
    'この案にも欠点があって、記録の保存に不具合があると、来院のキャンセルも失敗します。それでも、問い合わせに答えられることと、記録を取りこぼさないことを優先しました',
  ],
  'write-to-log': [
    'ログに出力する案ですね。DB の変更が不要なのは、この案の利点だと思います',
    'ただ、ログの出力は、来院の更新と同じトランザクションに入れられません。更新だけが成功して、記録が残らないことがあります',
    askAgain,
  ],
  'add-visits-column': [
    'visits テーブルに列を追加する案ですね。テーブルが増えませんし、来院ごとのキャンセルが1回だけなら、これで足ります',
    'ただ、同じ来院をもう一度キャンセルすると、前回の人と理由が上書きされます。visits テーブルの変更も必要になります',
    askAgain,
  ],
  'db-feature': [
    'DB の機能で自動的に記録する案ですね。更新処理ごとにコードを足さなくて済みますし、SQL で直接 UPDATE した変更も記録できます',
    'ただ、自動で記録できるのは、変更の前後の値だけです。今回の問い合わせで聞かれた、キャンセルした人と理由は記録できません',
    askAgain,
  ],
  'separate-transaction': [
    '別のトランザクションで記録する案ですね。記録の不具合が来院のキャンセルを止めないのは、この案の利点だと思います',
    'ただ、記録に失敗すると、更新だけが成功します。そのキャンセルの記録は残りません',
    askAgain,
  ],
  'rebuild-system': [
    'システム全体を作り直す案ですね。記録の実装が漏れる更新処理が無くなるのは、この案の利点だと思います',
    'ただ、全機能を一度に移行するので、停止と不具合のリスクが大きくなります',
    askAgain,
  ],
};

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
  readonly ask?: Omit<LiveConfig, 'channel'>;
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
    live: { channel: handsOnChannel, ...(options.ask ?? { label: `${handsOnChannel} へのメッセージ` }) },
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

export const docTab = (
  key: string,
  title: string,
  path: string,
  approvable = false,
  choice?: DocChoice,
): TabDefinition =>
  documentTab(key, title, path, {
    title,
    updatedAt: '2026-11-09',
    updatedBy: '同僚',
    ...(approvable ? { approvable } : {}),
    ...(choice === undefined ? {} : { choice }),
  });

export const introDocTab = (key: string, title: string, path: string): TabDefinition =>
  documentTab(key, title, path, { title });

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
