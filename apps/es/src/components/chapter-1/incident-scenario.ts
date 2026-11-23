export type Actor = 'support' | 'you';

export type Post = {
  readonly actor: Actor;
  readonly text: string;
};

export type LogEntry = {
  readonly level: 'INFO' | 'WARN';
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly status: number;
  readonly duration: number;
};

export type TimedEvent =
  | {
    readonly at: number;
    readonly kind: 'post';
    readonly post: Post;
    readonly unlessReplied?: true;
  }
  | {
    readonly at: number;
    readonly kind: 'log';
    readonly entry: LogEntry;
    readonly millis: number;
  }
  | { readonly at: number; readonly kind: 'sql'; readonly sql: string }
  | { readonly at: number; readonly kind: 'affected'; readonly count: number };

export const actors: Record<Actor, { name: string; avatar: string }> = {
  support: { name: 'カスタマーサポート', avatar: 'カ' },
  you: { name: 'あなた', avatar: 'あ' },
};

export const startedAt = Date.UTC(2026, 10, 6, 18, 20, 0);

export const visibleFromMinutes = 15;

export const initialVisits = [
  { id: 'visit-pochi', petName: 'ポチ', status: 'cancelled' },
  { id: 'visit-tama', petName: 'タマ', status: 'reserved' },
] as const;

export const initialAffected = 1;

export const logClient = { ip: '10.0.3.21', userAgent: 'Mozilla/5.0' };

export const earlierLogs: readonly (LogEntry & { readonly time: string })[] = [
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

export const heartbeat = {
  everySeconds: 4,
  requests: [
    { method: 'GET', path: '/visits' },
    { method: 'GET', path: '/visits/visit-pochi' },
    { method: 'GET', path: '/visits/visit-tama' },
  ] as const,
  durations: [7, 5, 8, 6, 9, 5, 7],
  millis: [118, 402, 276, 531],
};

export const cancelTamaSql = `UPDATE visits SET status = 'cancelled' WHERE id = 'visit-tama';`;

export const timeline: readonly TimedEvent[] = [
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
];

export const interim = {
  heading: '途中経過です。',
  unknown: '調査中',
  order: ['when', 'what', 'who', 'why'],
} as const;

export const reply = {
  text:
    '2026-11-06 18:11:58 にポチの来院のキャンセルの操作がありました。誰が、なぜキャンセルしたのかは、どこにも残っていませんでした。',
  tamaText: 'タマの来院も、18:20:30 に同じ操作でキャンセルになっています。',
  tamaAfter: 30,
  followUps: [
    {
      delay: 1.5,
      text: '誰が、なぜキャンセルしたのか分からないと、病院に説明できません。',
    },
    { delay: 1.5, text: 'なんで記録取ってないんですか' },
  ],
} as const;
