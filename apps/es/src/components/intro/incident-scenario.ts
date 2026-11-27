import type { Condition, EarlierLog, SignalRef, WorkspaceScenario } from '../../workspace/scenario';
import { handsOnChannel } from '../chapters/common';

export const startedAt = Date.UTC(2026, 10, 6, 18, 20, 0);

const cancelTamaSql = `UPDATE visits SET status = 'cancelled' WHERE id = 'visit-tama';`;

export const earlierLogs: readonly EarlierLog[] = [
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
    counter: { label: 'キャンセルになった来院', short: 'キャンセル', unit: '件', initial: 1 },
  },
  startGuide: [
    'あなたは、動物病院向けの予約システムの開発者です。',
    'カスタマーサポートから連絡が届きます。届いた連絡に対応してください。',
    '操作する人はこのブラウザで操作できます。見るだけの人は講師の画面で追えます。',
  ],
  chat: {
    workspace: 'clinic-dev',
    channels: [
      { name: '# general' },
      { name: '# dev' },
      { name: '# 問い合わせ対応', current: true },
      { name: '# 障害対応' },
      { name: handsOnChannel },
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
    { at: 0, kind: 'post', post: { actor: 'support', text: 'お疲れ様です！すみません、急ぎで見てほしいです🙏' } },
    {
      at: 2,
      kind: 'post',
      post: {
        actor: 'support',
        text:
          '動物病院さんから電話があって、入院中のはずの来院がキャンセルになってるそうです。飼い主さんがもうお迎えに来ちゃってて…',
      },
    },
    {
      at: 5,
      kind: 'post',
      post: {
        actor: 'support',
        text: 'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？',
      },
    },
    {
      at: 15,
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
    { at: 15, kind: 'sql', sql: cancelTamaSql },
    { at: 15, kind: 'affected', count: 2 },
    { at: 20, kind: 'post', post: { actor: 'support', text: 'すみません、もう1件です' } },
    {
      at: 23,
      kind: 'post',
      post: {
        actor: 'support',
        text:
          '別の飼い主さんからも同じ連絡が来てて、タマちゃん（visit-tama）もキャンセルになってます。さっき見たときは予約のままだったんですが…',
      },
    },
    {
      at: 34,
      kind: 'post',
      post: {
        actor: 'support',
        text: '病院さんに折り返さないとなので、わかってるところまででいいので教えてください！',
      },
      unlessReplied: true,
    },
    {
      at: 56,
      kind: 'post',
      post: { actor: 'support', text: 'どうでしょう…？病院さんずっとお待ちで💦' },
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
    heading: 'いま分かってるところです',
    unknown: 'まだ何も分かってないです、調査中です',
    pending: '{labels} は調査中です',
    order: ['when', 'what', 'who', 'why'],
  },
  reply: {
    lines: [
      { text: '18:11:58 にポチの来院をキャンセルする操作があったのは確認できました' },
      { after: 15, text: 'タマの来院も 18:20:15 に同じ操作でキャンセルされてます' },
      { text: 'ただ、誰がなんでキャンセルしたかは、DB にもログにもコードにも残ってなくて、分からないです…' },
    ],
    followUps: [
      { actor: 'support', delay: 0.8, text: 'えっ' },
      { actor: 'support', delay: 0.8, text: '誰がなんでキャンセルしたか分からないと、病院さんに説明できないです…' },
      { actor: 'support', delay: 1, text: 'なんで記録取ってないんですか' },
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
