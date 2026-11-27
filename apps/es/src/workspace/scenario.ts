export const signalNames = [
  'workspace:started',
  'tab:selected',
  'sql:executed',
  'sql:target-shown',
  'log:detail-opened',
  'log:target-opened',
  'chat:interim-sent',
  'chat:replied',
  'agent:requested',
  'agent:concluded',
  'tests:ran',
  'tests:passed',
  'code:run',
  'question:written',
  'figure:step',
] as const;

export type SignalName = (typeof signalNames)[number];

export type SignalRef = SignalName | { readonly name: SignalName; readonly key: string };

export type Condition =
  | SignalRef
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] };

export type SignalDetail = {
  readonly name: SignalName;
  readonly data?: Readonly<Record<string, unknown>>;
};

export const signalEventName = 'workspace:signal';

export type ActorTone = 'rose' | 'blue' | 'green' | 'amber' | 'violet' | 'slate';

export type Actor = {
  readonly name: string;
  readonly avatar: string;
  readonly tone: ActorTone;
  readonly self?: true;
};

export type Post = {
  readonly actor: string;
  readonly text: string;
  readonly list?: readonly string[];
  readonly time?: string;
  readonly channel?: string;
};

export type LogEntry = {
  readonly level: 'INFO' | 'WARN';
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly status: number;
  readonly duration: number;
};

export type ButtonName = 'interim' | 'reply' | 'answer';

export type MemoState = 'unknown' | 'found' | 'missing';

type AtSeconds = { readonly at: number; readonly when?: undefined; readonly key?: undefined };
type OnSignal = { readonly when: SignalName; readonly key?: string; readonly at?: undefined };

export type Trigger = AtSeconds | OnSignal;

export type TabAction = 'add' | 'open' | 'unseen';

export type Effect =
  | { readonly kind: 'post'; readonly post: Post; readonly unlessReplied?: true }
  | { readonly kind: 'log'; readonly entry: LogEntry; readonly millis: number; readonly tab?: string }
  | { readonly kind: 'sql'; readonly sql: string; readonly tab?: string }
  | { readonly kind: 'affected'; readonly count: number }
  | { readonly kind: 'tab'; readonly tab: string; readonly action: TabAction }
  | { readonly kind: 'memo'; readonly memo: string; readonly state: MemoState; readonly text?: string }
  | { readonly kind: 'enable'; readonly button: ButtonName };

export type TimelineEvent = Trigger & Effect;

export type TableInfo = {
  readonly name: string;
  readonly columns: readonly { readonly name: string; readonly type: string }[];
};

export type DbSetup =
  | { readonly kind: 'sql'; readonly sql: string }
  | {
    readonly kind: 'schema';
    readonly snapshot: string;
    readonly file: string;
    readonly table: string;
    readonly columns: readonly string[];
    readonly rows: readonly (readonly string[])[];
  }
  | {
    readonly kind: 'script';
    readonly exercise: string;
    readonly entry: string;
    readonly own?: { readonly exercise: string; readonly file: string; readonly testFile: string };
    readonly tables: readonly TableInfo[];
  };

export type DbConsoleConfig = {
  readonly storageId: string;
  readonly initialSql: string;
  readonly connection: { readonly name: string; readonly engine: string };
  readonly setup: DbSetup;
  readonly target?: {
    readonly column: string;
    readonly value: string;
    readonly read?: readonly string[];
  };
  readonly open?: { readonly sql: string };
  readonly controls?: true;
};

export type LogRule = {
  readonly kind: 'periodic';
  readonly everySeconds: number;
  readonly requests: readonly { readonly method: 'GET' | 'POST'; readonly path: string }[];
  readonly durations: readonly number[];
  readonly millis: readonly number[];
};

export type EarlierLog = LogEntry & { readonly time: string };

export type LogExplorerConfig = {
  readonly service: string;
  readonly host: string;
  readonly client: { readonly ip: string; readonly userAgent: string };
  readonly earlier: readonly EarlierLog[];
  readonly rules: readonly LogRule[];
  readonly visibleFromMinutes: number;
  readonly rail: readonly boolean[];
  readonly initialQuery: string;
  readonly target?: { readonly method: 'GET' | 'POST'; readonly path: string };
  readonly open?: { readonly query: string };
};

export type RepoConfig = {
  readonly snapshot: string;
  readonly file: string;
  readonly owner: string;
  readonly name: string;
  readonly visibility: string;
  readonly branch: string;
  readonly path: readonly string[];
};

export type EditorConfig = {
  readonly project: string;
  readonly branch: string;
  readonly snapshot: string;
  readonly active: string;
};

export type DocConfig = {
  readonly title: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly approvable?: boolean;
};

export type PrDiffConfig = {
  readonly file: string;
  readonly before: string;
  readonly after: string;
  readonly context: number;
};

export type PrConfig = {
  readonly owner: string;
  readonly name: string;
  readonly number: number;
  readonly title: string;
  readonly status: 'Open';
  readonly diff: PrDiffConfig;
};

export type FaviconTone = 'teal' | 'violet' | 'ink' | 'coral' | 'blue' | 'azure';
export type FaviconShape = 'circle' | 'square' | 'rounded';

type TabBase = {
  readonly key: string;
  readonly title: string;
  readonly label: string;
  readonly url: string;
  readonly favicon: { readonly tone: FaviconTone; readonly shape: FaviconShape };
  readonly initial?: boolean;
  readonly seen?: SignalRef;
  readonly note?: string;
};

export type TabDefinition =
  | (TabBase & { readonly kind: 'console'; readonly config: DbConsoleConfig })
  | (TabBase & { readonly kind: 'logs'; readonly config: LogExplorerConfig })
  | (TabBase & { readonly kind: 'repo'; readonly config: RepoConfig })
  | (TabBase & { readonly kind: 'agent' })
  | (TabBase & { readonly kind: 'slot' })
  | (TabBase & { readonly kind: 'editor'; readonly config: EditorConfig })
  | (TabBase & { readonly kind: 'doc'; readonly config: DocConfig })
  | (TabBase & { readonly kind: 'pr'; readonly config: PrConfig });

export type TabKind = TabDefinition['kind'];

export type StatusConfig = {
  readonly label: string;
  readonly elapsed: string;
  readonly start: string;
  readonly counter?: {
    readonly label: string;
    readonly short?: string;
    readonly unit: string;
    readonly initial: number;
  };
};

export type ChatButton = {
  readonly name: ButtonName;
  readonly label: string;
  readonly primary?: true;
  readonly locked?: true;
};

export type ChatConfig = {
  readonly workspace: string;
  readonly channels: readonly { readonly name: string; readonly current?: true }[];
  readonly channel: string;
  readonly placeholder: string;
  readonly buttons: readonly ChatButton[];
  readonly collapsed?: true;
};

export type FieldFormat = 'datetime';

export type MemoRead = {
  readonly signal: SignalName;
  readonly field: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly format?: FieldFormat;
};

export type MemoItem = {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  readonly result: 'found' | 'missing';
  readonly fill: Condition;
  readonly read?: MemoRead;
};

export type MemoConfig = {
  readonly title: string;
  readonly unknown: string;
  readonly items: readonly MemoItem[];
};

export type GatesConfig = {
  readonly reply: {
    readonly bypass?: SignalName;
    readonly requires: readonly { readonly signal: SignalRef; readonly reason: string }[];
    readonly reasons: { readonly all: string; readonly several: string };
  };
};

export type InterimConfig = {
  readonly heading: string;
  readonly unknown: string;
  readonly pending: string;
  readonly order: readonly string[];
};

export type ReplyLine = { readonly text: string; readonly after?: number };

export type ReplyConfig = {
  readonly lines: readonly ReplyLine[];
  readonly from?: { readonly signal: SignalName; readonly formats?: Readonly<Record<string, FieldFormat>> };
  readonly followUps: readonly { readonly actor: string; readonly delay: number; readonly text: string }[];
};

export type AgentToolBody =
  | { readonly type: 'rows'; readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly type: 'log'; readonly time: string }
  | { readonly type: 'code'; readonly snapshot: string; readonly file: string; readonly export: string };

export type AgentStep =
  | { readonly kind: 'user'; readonly text: string }
  | { readonly kind: 'agent'; readonly text: string }
  | {
    readonly kind: 'tool';
    readonly name: string;
    readonly target: string;
    readonly body: AgentToolBody;
    readonly open: string;
  }
  | {
    readonly kind: 'conclusion';
    readonly items: readonly { readonly label: string; readonly text: string }[];
    readonly text: string;
  };

export type AgentConfig = {
  readonly brand: string;
  readonly session: string;
  readonly steps: readonly AgentStep[];
  readonly followUp: string;
  readonly stepDelayMs: number;
  readonly toolDelayMs: number;
};

export type WorkspaceScenario = {
  readonly id: string;
  readonly mode: 'timed' | 'untimed';
  readonly label: string;
  readonly startedAt: number;
  readonly status: StatusConfig;
  readonly startGuide: readonly string[];
  readonly chat: ChatConfig;
  readonly actors: Readonly<Record<string, Actor>>;
  readonly history: readonly Post[];
  readonly timeline: readonly TimelineEvent[];
  readonly tabs: readonly TabDefinition[];
  readonly memo?: MemoConfig;
  readonly gates?: GatesConfig;
  readonly interim?: InterimConfig;
  readonly reply?: ReplyConfig;
  readonly agent?: AgentConfig;
  readonly done?: Condition;
};

export const tabOfKind = <K extends TabKind>(
  scenario: WorkspaceScenario,
  kind: K,
  key?: string,
): Extract<TabDefinition, { kind: K }> | undefined =>
  scenario.tabs.find(
    (tab): tab is Extract<TabDefinition, { kind: K }> => tab.kind === kind && (key === undefined || tab.key === key),
  );
