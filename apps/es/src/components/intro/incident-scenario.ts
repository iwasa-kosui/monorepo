import type { Condition, EarlierLog, SignalRef, WorkspaceScenario } from '../../workspace/scenario';

const startedAt = Date.UTC(2026, 10, 6, 18, 20, 0);

const cancelTamaSql = `UPDATE visits SET status = 'cancelled' WHERE id = 'visit-tama';`;

const earlierLogs: readonly EarlierLog[] = [
  {
    time: '2026-11-06T09:12:04.118Z',
    level: 'INFO',
    method: 'POST',
    path: '/visits',
    status: 201,
    duration: 15,
  },
  {
    time: '2026-11-06T09:12:04.170Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits/visit-pochi',
    status: 200,
    duration: 6,
  },
  {
    time: '2026-11-06T10:31:47.902Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits',
    status: 200,
    duration: 9,
  },
  {
    time: '2026-11-06T11:05:13.356Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits/visit-tama',
    status: 200,
    duration: 5,
  },
  {
    time: '2026-11-06T12:48:30.611Z',
    level: 'WARN',
    method: 'GET',
    path: '/visits/visit-9999',
    status: 404,
    duration: 4,
  },
  {
    time: '2026-11-06T13:20:09.045Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits',
    status: 200,
    duration: 8,
  },
  {
    time: '2026-11-06T14:02:55.730Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits/visit-pochi',
    status: 200,
    duration: 5,
  },
  {
    time: '2026-11-06T15:36:41.287Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits',
    status: 200,
    duration: 7,
  },
  {
    time: '2026-11-06T16:19:02.664Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits/visit-tama',
    status: 200,
    duration: 6,
  },
  {
    time: '2026-11-06T17:44:18.509Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits',
    status: 200,
    duration: 8,
  },
  {
    time: '2026-11-06T18:10:41.203Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits',
    status: 200,
    duration: 8,
  },
  {
    time: '2026-11-06T18:11:52.117Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits/visit-pochi',
    status: 200,
    duration: 5,
  },
  {
    time: '2026-11-06T18:11:58.846Z',
    level: 'INFO',
    method: 'POST',
    path: '/visits/visit-pochi/cancel',
    status: 200,
    duration: 12,
  },
  {
    time: '2026-11-06T18:11:58.901Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits',
    status: 200,
    duration: 7,
  },
  {
    time: '2026-11-06T18:14:20.455Z',
    level: 'INFO',
    method: 'GET',
    path: '/visits/visit-tama',
    status: 200,
    duration: 5,
  },
];

const consoleShown: SignalRef = 'sql:target-shown';
const logOpened: SignalRef = 'log:target-opened';
const repoOpened: SignalRef = { name: 'tab:selected', key: 'repo' };

const allOpened: Condition = { all: [consoleShown, logOpened, repoOpened] };

export const incidentScenario: WorkspaceScenario = {
  id: 'investigation',
  mode: 'timed',
  label: '来院のキャンセル理由の調査',
  startedAt,
  status: {
    label: '対応の状況',
    elapsed: '対応開始から',
    start: '対応を始める',
    counter: { label: 'キャンセルになった来院', unit: '件', initial: 1 },
  },
  startGuide: [
    'あなたは、動物病院向けの予約システムの開発者です。',
    'カスタマーサポートから連絡が届きます。届いた連絡に対応してください。',
    '手を動かす人はこのブラウザで動かせます。見るだけの人は講師の画面で追えます。',
  ],
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
    buttons: [
      { name: 'interim', label: '途中経過を報告する' },
      { name: 'reply', label: '調査結果を返信する', primary: true },
      { name: 'answer', label: '答えを見る' },
    ],
  },
  actors: {
    support: { name: 'カスタマーサポート', avatar: 'カ', tone: 'rose' },
    you: { name: 'あなた', avatar: 'あ', tone: 'blue', self: true },
  },
  history: [],
  timeline: [
    {
      at: 0,
      kind: 'post',
      post: {
        actor: 'support',
        text:
          '動物病院から電話です。予約していた来院がキャンセルになっていて、受付に飼い主が来ているそうです。\nポチの来院（visit-pochi）です。誰が、いつ、なぜキャンセルしたのか、調べてもらえますか。',
      },
    },
    {
      at: 30,
      kind: 'log',
      entry: {
        level: 'INFO',
        method: 'POST',
        path: '/visits/visit-tama/cancel',
        status: 200,
        duration: 11,
      },
      millis: 214,
    },
    { at: 30, kind: 'sql', sql: cancelTamaSql },
    { at: 30, kind: 'affected', count: 2 },
    {
      at: 36,
      kind: 'post',
      post: {
        actor: 'support',
        text:
          '別の飼い主からも連絡が来ました。タマの来院（visit-tama）もキャンセルになっているそうです。さっきまで予約のままでした。',
      },
    },
    {
      at: 60,
      kind: 'post',
      post: {
        actor: 'support',
        text: '病院に折り返します。分かったところまで教えてください。',
      },
    },
    {
      at: 105,
      kind: 'post',
      post: { actor: 'support', text: 'まだ分かりませんか。病院が待っています。' },
      unlessReplied: true,
    },
    { when: 'agent:requested', kind: 'tab', tab: 'agent', action: 'open' },
  ],
  tabs: [
    {
      key: 'console',
      kind: 'console',
      title: 'DB Console',
      label: 'DB コンソール',
      url: 'https://db.internal.example/console',
      favicon: { tone: 'teal', shape: 'circle' },
      seen: consoleShown,
      note: 'いまの状態だけが入っています。',
      config: {
        storageId: 'chapter-1-console',
        initialSql: 'SELECT * FROM visits;',
        connection: { name: 'clinic_production（read-write）', engine: 'SQLite' },
        setup: {
          kind: 'schema',
          snapshot: 'chapter-1-start',
          file: 'db.ts',
          table: 'visits',
          columns: ['id', 'pet_name', 'status'],
          rows: [
            ['visit-pochi', 'ポチ', 'cancelled'],
            ['visit-tama', 'タマ', 'reserved'],
          ],
        },
        target: { column: 'status', value: 'visit-pochi' },
        open: { sql: `SELECT * FROM visits WHERE id = 'visit-pochi';` },
      },
    },
    {
      key: 'logs',
      kind: 'logs',
      title: 'Log Explorer',
      label: 'ログの検索',
      url: 'https://logs.internal.example/logs',
      favicon: { tone: 'violet', shape: 'square' },
      seen: logOpened,
      note: 'キャンセルの操作があった時刻は分かります。理由と操作した人は、ログの属性にありません。',
      config: {
        service: 'clinic-api',
        host: 'clinic-api-1',
        client: { ip: '10.0.3.21', userAgent: 'Mozilla/5.0' },
        earlier: earlierLogs,
        rules: [
          {
            kind: 'periodic',
            everySeconds: 4,
            requests: [
              { method: 'GET', path: '/visits' },
              { method: 'GET', path: '/visits/visit-pochi' },
              { method: 'GET', path: '/visits/visit-tama' },
            ],
            durations: [7, 5, 8, 6, 9, 5, 7],
            millis: [118, 402, 276, 531],
          },
        ],
        visibleFromMinutes: 15,
        rail: [false, false, true, false, false],
        initialQuery: 'service:clinic-api',
        target: { method: 'POST', path: '/visits/visit-pochi/cancel' },
        open: { query: 'service:clinic-api visit-pochi' },
      },
    },
    {
      key: 'repo',
      kind: 'repo',
      title: 'clinic-api/visits.ts',
      label: 'リポジトリ',
      url: 'https://code.internal.example/clinic/visits.ts',
      favicon: { tone: 'ink', shape: 'circle' },
      seen: repoOpened,
      note: 'status を書き換えるだけで、理由と操作した人はどこにも保存していません。',
      config: {
        snapshot: 'chapter-1-start',
        file: 'visits.ts',
        owner: 'clinic',
        name: 'clinic-api',
        visibility: 'Private',
        branch: 'main',
        path: ['src', 'visits.ts'],
      },
    },
    {
      key: 'agent',
      kind: 'agent',
      title: 'Coding Agent',
      label: 'エージェント',
      url: 'https://agent.internal.example/sessions/1',
      favicon: { tone: 'coral', shape: 'rounded' },
      initial: false,
    },
  ],
  memo: {
    title: '返信の下書き（調査メモ）',
    unknown: 'まだ分からない',
    items: [
      {
        key: 'who',
        label: '誰が',
        text: 'どこにも残っていない',
        result: 'missing',
        fill: { any: [allOpened, 'agent:concluded'] },
      },
      {
        key: 'when',
        label: 'いつ',
        text: '2026-11-06 18:11:58',
        result: 'found',
        fill: { any: [logOpened, 'agent:concluded'] },
      },
      {
        key: 'what',
        label: '何を',
        text: 'status が cancelled',
        result: 'found',
        fill: { any: [consoleShown, 'agent:concluded'] },
      },
      {
        key: 'why',
        label: 'なぜ',
        text: 'どこにも残っていない',
        result: 'missing',
        fill: { any: [allOpened, 'agent:concluded'] },
      },
    ],
  },
  gates: {
    reply: {
      bypass: 'agent:concluded',
      requires: [
        { signal: consoleShown, reason: 'DB コンソールで、visit-pochi の status を表示すると返信できます。' },
        { signal: logOpened, reason: 'ログの検索で、キャンセルの操作のログを開くと返信できます。' },
        { signal: repoOpened, reason: 'リポジトリのタブを開くと返信できます。' },
      ],
      reasons: {
        all: '3つのツールをすべて開くと返信できます。',
        several: 'あと{count}つのツールを開くと返信できます。',
      },
    },
  },
  interim: {
    heading: '途中経過です。',
    unknown: '調査中',
    order: ['when', 'what', 'who', 'why'],
  },
  reply: {
    text:
      '2026-11-06 18:11:58 にポチの来院のキャンセルの操作がありました。誰が、なぜキャンセルしたのかは、どこにも残っていませんでした。',
    additions: [{ after: 30, text: 'タマの来院も、18:20:30 に同じ操作でキャンセルになっています。' }],
    followUps: [
      {
        actor: 'support',
        delay: 1.5,
        text: '誰が、なぜキャンセルしたのか分からないと、病院に説明できません。',
      },
      { actor: 'support', delay: 1.5, text: 'なんで記録取ってないんですか' },
    ],
  },
  agent: {
    brand: 'Coding Agent',
    session: 'visit-pochi のキャンセルの調査',
    stepDelayMs: 800,
    toolDelayMs: 600,
    followUp: 'これ以上調べられるデータがありません。理由と操作した人は、どこにも記録されていません。',
    steps: [
      {
        kind: 'user',
        text: 'visit-pochi の来院がキャンセルになっています。誰が、いつ、なぜキャンセルしたのかを調べてください。',
      },
      { kind: 'agent', text: 'データベース、ログ、コードの順に調べます。' },
      {
        kind: 'tool',
        name: 'SQL',
        target: `SELECT * FROM visits WHERE id = 'visit-pochi';`,
        body: {
          type: 'rows',
          columns: ['id', 'pet_name', 'status'],
          rows: [['visit-pochi', 'ポチ', 'cancelled']],
        },
        open: 'console',
      },
      { kind: 'agent', text: 'status は cancelled です。キャンセルした人、理由、日時の列はありません。' },
      {
        kind: 'tool',
        name: 'Logs',
        target: 'service:clinic-api visit-pochi',
        body: { type: 'log', time: '2026-11-06T18:11:58.846Z' },
        open: 'logs',
      },
      {
        kind: 'agent',
        text: '2026-11-06 18:11:58 にキャンセルの操作がありました。ログの属性に、操作した人と理由はありません。',
      },
      {
        kind: 'tool',
        name: 'Read',
        target: 'clinic/visits.ts',
        body: { type: 'code', snapshot: 'chapter-1-start', file: 'visits.ts', export: 'cancelVisit' },
        open: 'repo',
      },
      {
        kind: 'agent',
        text:
          'cancelVisit は status を書き換えるだけです。理由と操作した人を受け取っておらず、どこにも保存していません。',
      },
      {
        kind: 'conclusion',
        items: [
          { label: 'いつ', text: '2026-11-06 18:11:58' },
          { label: '何を', text: 'status を cancelled に更新' },
          { label: '誰が', text: '特定できません' },
          { label: 'なぜ', text: '特定できません' },
        ],
        text:
          '理由と操作した人は、データベースにも、ログにも、コードにも記録されていません。記録されていないデータは、私にも復元できません。',
      },
    ],
  },
};
