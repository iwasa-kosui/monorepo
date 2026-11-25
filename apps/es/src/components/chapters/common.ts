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

export const actors: Readonly<Record<'support' | 'you' | 'techlead', Actor>> = {
  support: { name: 'カスタマーサポート', avatar: 'カ', tone: 'rose' },
  you: { name: 'あなた', avatar: 'あ', tone: 'blue', self: true },
  techlead: { name: 'テックリード', avatar: 'テ', tone: 'violet' },
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

const lead = (text: string): Post => ({ actor: 'techlead', text });
const support = (text: string): Post => ({ actor: 'support', text });

export const posts = {
  afterIncident: lead('さっきの件、おつかれさまでした'),
  ownQuestion: lead(
    '自分が担当してるシステムで、いまのデータだけだと答えられない質問って何かあります？1つ書いてみてほしいです',
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
};

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
      { name: '# dev' },
      { name: '# 問い合わせ対応', current: true },
      { name: '# 障害対応' },
    ],
    channel: '# 問い合わせ対応',
    placeholder: '# 問い合わせ対応 へのメッセージ',
    buttons: options.buttons ?? [],
    ...(options.collapsed === true ? { collapsed: true as const } : {}),
  },
  actors,
  history: options.history ?? [],
  timeline: options.timeline ?? [],
  tabs: options.tabs,
  ...(options.memo === undefined ? {} : { memo: options.memo }),
  ...(options.gates === undefined ? {} : { gates: options.gates }),
  ...(options.reply === undefined ? {} : { reply: options.reply }),
});

export const opening = (...group: readonly Post[]): TimelineEvent[] =>
  group.map((post, index) => ({ at: index * 2, kind: 'post', post }));

const documentTab = (key: string, title: string, path: string, config: DocConfig): TabDefinition => ({
  key,
  kind: 'doc',
  title,
  label: '社内の文書',
  url: `https://docs.internal.example/${path}`,
  favicon: { tone: 'blue', shape: 'square' },
  config,
});

export const docTab = (key: string, title: string, path: string): TabDefinition =>
  documentTab(key, title, path, { title, updatedAt: '2026-11-09', updatedBy: 'テックリード' });

export const editorTab = (
  key: string,
  active: string,
  config: Pick<EditorConfig, 'snapshot'> & Partial<EditorConfig>,
): TabDefinition => ({
  key,
  kind: 'editor',
  title: `${active} — clinic-api`,
  label: 'エディタ',
  url: `https://ide.internal.example/clinic-api/${active}`,
  favicon: { tone: 'azure', shape: 'rounded' },
  config: { project: 'clinic-api', branch: 'record-cancellation', active, ...config },
});
