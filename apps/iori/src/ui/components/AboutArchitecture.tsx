import type { Child } from 'hono/jsx';

type Lang = 'ja' | 'en';
type Tone = 'worker' | 'fedi' | 'bsky' | 'store' | 'plain';

export const cardClass = 'bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 sm:p-8';
export const insetClass = 'bg-sand-light/50 dark:bg-gray-700/50 rounded-xl shadow-clay-inset';
export const bodyClass = 'text-charcoal-light dark:text-gray-400';
export const listClass = 'list-disc pl-5 space-y-1 text-charcoal-light dark:text-gray-400';

const h3Class = 'text-lg font-semibold text-charcoal dark:text-white mb-2';

const stack = [
  { name: 'Runtime', value: 'Cloudflare Workers' },
  { name: 'Framework', value: 'Hono' },
  { name: 'Federation', value: 'Fedify' },
  { name: 'Database', value: 'Cloudflare D1 + Drizzle ORM' },
  { name: 'Storage / Queue', value: 'Cloudflare R2, KV, Queues' },
  { name: 'AI', value: 'Workers AI' },
  { name: 'Validation', value: 'Zod' },
  { name: 'Build', value: 'Vite' },
] as const;

const content = {
  ja: {
    title: 'しくみ',
    intro: 'iori の設計のうち、特徴のある5つを図で説明します。',
    legend: { worker: 'Worker', fedi: 'ActivityPub', bsky: 'AT Protocol', store: 'Cloudflare のサービス' },
    serverless: {
      title: '常駐するサーバーを持たない',
      description:
        'iori は Cloudflare Workers の上で、1つの Worker として動きます。Worker が動くきっかけは、HTTP リクエスト、キューのメッセージ、Cron Triggers の3つだけです。フォロワーへの配送のように時間のかかる処理は、Queues に積み、あとから queue の入口で処理します。',
      label: '3つのきっかけが1つの Worker を起動し、Worker が D1、R2、KV、Workers AI を使う図',
      http: '画面、アプリ、連合',
      queues: '配送の順番待ち',
      cron: '毎分から毎日まで',
      worker: 'iori の Worker',
      fetch: 'すぐに応答する',
      queue: 'あとで処理する',
      scheduled: '定期的に実行する',
      enqueue: '積む',
      d1: 'データベース',
      r2: '画像',
      kv: '一時データ',
      ai: '要約、翻訳、bot',
      notes: [
        '画面も、Mastodon 互換 API を呼ぶクライアントの1つです。そのため、Mastodon 用のアプリからも同じように使えます。',
      ],
    },
    delivery: {
      title: '1つのノートを、2つのプロトコルへ送る',
      description:
        'ノートを保存すると、iori は ActivityPub と AT Protocol の両方へ送ります。Fediverse へは、キューを通してフォロワーのサーバーに配送し、届かなければ間隔を空けて再試行します。Bluesky へは、投稿への応答を返した直後に送信します。',
      label: '1つのノートが D1 に保存され、キューを通って Fediverse のサーバーへ、直接 Bluesky へ送られる図',
      note: 'ノートを投稿',
      worker: '保存して、配送を依頼する',
      batch: '1つのバッチで書く',
      queues: '配送を積む',
      queue: '署名して送信する',
      retry: '届かなければ再試行',
      bluesky: '応答のあとに送信',
      others: 'その他',
      followers: 'フォロワーのサーバー',
      notes: ['相手のサーバーが応答しなくても、投稿は失敗しません。'],
    },
    timeline: {
      title: '届く投稿と、取りに行く投稿を1つの一覧にする',
      description:
        'Fediverse の投稿は、相手のサーバーから iori に届きます。Bluesky の投稿は、iori が毎分取りに行きます。届き方の違う2種類の投稿を、ホームタイムラインでは時刻の順に1つの一覧へ混ぜます。',
      label: 'Fediverse から届く投稿と、Bluesky から取得する投稿が、D1 を経てホームタイムラインで1つになる図',
      fediverse: 'Fediverse のサーバー',
      pushed: '相手から届く',
      pulled: 'iori が取りに行く',
      fetch: '署名を検証する',
      scheduled: '毎分起動する',
      queues: 'queue の入口が処理する',
      d1: '投稿を保存する',
      home: 'ホームタイムライン',
      merged: '時刻の順に1つの一覧へ混ぜる',
      notes: ['同じ投稿が両方から届いた場合は、重複を取り除きます。'],
    },
    events: {
      title: '状態とイベントを、同じバッチで書く',
      description:
        'domain の関数はデータベースに触れず、「何が起きたか」を表すイベントを返します。ストアは、いまの状態とそのイベントを、D1 の1つのバッチで書き込みます。記録したイベントは、投稿の編集履歴の表示などに使います。',
      label: 'useCase が domain を呼び、domain が返したイベントをストアが状態と一緒に1つのバッチで D1 に書き込む図',
      useCase: '業務の流れを組み立てる',
      domain: '状態を変えず、イベントを返す',
      store: '1つのバッチにまとめる',
      state: 'いまの状態',
      record: '何が起きたかの記録',
      batch: 'D1 の db.batch。両方を書くか、どちらも書かない',
      notes: [
        'エラーは例外を投げず、Result 型の値として返します。',
        'データの形は Zod のスキーマで定義し、型をスキーマから導出します。',
      ],
    },
    digest: {
      title: '自分の投稿から、毎朝読む記事を選ぶ',
      description:
        'iori は3時間ごとに28のフィードを収集し、記事を埋め込みに変換します。私の投稿といいねも同じように埋め込みに変換し、関心の手がかりにします。毎朝、手がかりに近い記事をトピックごとに選び、要約してダイジェストにします。',
      label:
        'フィードの記事と自分の投稿を埋め込みに変換して D1 に保存し、Worker が類似度を計算して毎朝のダイジェストを作る図',
      feeds: '28のフィード',
      feedsSub: 'Zenn、はてブ、Hacker News など',
      own: '自分の投稿といいね',
      ownSub: '関心の手がかり',
      space: '埋め込みの空間（1024次元）',
      spaceSub: 'bge-m3 で変換して D1 に保存する。近さは Worker が計算する',
      ownDot: '自分の投稿',
      nearDot: '近い記事',
      result: '毎朝 6:30 のダイジェスト',
      resultSub: '最大4トピック、各5件を要約して通知する',
      notes: [
        '埋め込みは D1 の BLOB の列に保存し、類似度は Worker の中で計算します。専用のベクトルデータベースは使っていません。',
        '新しい手がかりほど重くなるように、時間の経過で重みを減らします。',
      ],
    },
    stack: { title: '使っている技術', items: stack },
  },
  en: {
    title: 'How it works',
    intro: 'Five distinctive parts of the design of iori, explained with diagrams.',
    legend: { worker: 'Worker', fedi: 'ActivityPub', bsky: 'AT Protocol', store: 'Cloudflare services' },
    serverless: {
      title: 'No always-on server',
      description:
        'iori runs on Cloudflare Workers as a single Worker. Only three things start the Worker: an HTTP request, a queue message, and Cron Triggers. Slow work such as delivery to followers is put on Queues and handled later by the queue entry point.',
      label: 'Three triggers start one Worker, and the Worker uses D1, R2, KV, and Workers AI',
      http: 'apps and servers',
      queues: 'pending work',
      cron: 'minutely to daily',
      worker: 'iori Worker',
      fetch: 'responds now',
      queue: 'works later',
      scheduled: 'runs on schedule',
      enqueue: 'enqueue',
      d1: 'database',
      r2: 'images',
      kv: 'temp state',
      ai: 'summaries, bot',
      notes: [
        'The web UI is also a client of the Mastodon-compatible API, so Mastodon apps can use iori in the same way.',
      ],
    },
    delivery: {
      title: 'One note, two protocols',
      description:
        'When a note is saved, iori sends it over both ActivityPub and AT Protocol. For the Fediverse, it delivers to the followers\' servers through a queue and retries at intervals on failure. For Bluesky, it sends right after responding to the post request.',
      label: 'One note is saved to D1, delivered to Fediverse servers through a queue, and sent directly to Bluesky',
      note: 'Post a note',
      worker: 'save, then deliver',
      batch: 'one batch',
      queues: 'holds deliveries',
      queue: 'signs and sends',
      retry: 'retries on failure',
      bluesky: 'sent right after',
      others: 'others',
      followers: 'followers\' servers',
      notes: ['The post does not fail even when a remote server does not respond.'],
    },
    timeline: {
      title: 'Pushed and pulled posts in one timeline',
      description:
        'Fediverse posts are pushed to iori by remote servers. Bluesky posts are pulled by iori every minute. The home timeline merges these two kinds of posts into one list ordered by time.',
      label: 'Posts pushed from the Fediverse and posts pulled from Bluesky go through D1 and become one home timeline',
      fediverse: 'Fediverse servers',
      pushed: 'pushed to iori',
      pulled: 'pulled by iori',
      fetch: 'verifies the signature',
      scheduled: 'runs every minute',
      queues: 'handled by queue',
      d1: 'stores the posts',
      home: 'Home timeline',
      merged: 'merged into one list by time',
      notes: ['When the same post arrives from both sides, the duplicate is removed.'],
    },
    events: {
      title: 'State and events in one batch',
      description:
        'Functions in domain do not touch the database. They return an event that describes what happened. The store writes the current state and that event in a single D1 batch. The recorded events are used for features such as the edit history of a post.',
      label:
        'useCase calls domain, and the store writes the event returned by domain together with the state in one D1 batch',
      useCase: 'orchestrates the flow',
      domain: 'pure function, returns an event',
      store: 'one batch per write',
      state: 'current state',
      record: 'record of what happened',
      batch: 'D1 db.batch: both rows or neither',
      notes: [
        'Errors are returned as Result values instead of thrown exceptions.',
        'Data shapes are defined as Zod schemas, and types are derived from the schemas.',
      ],
    },
    digest: {
      title: 'Picking each morning\'s reading from my own posts',
      description:
        'Every three hours, iori collects 28 feeds and converts the articles into embeddings. My posts and likes are converted into embeddings in the same way and used as signals of interest. Each morning, iori picks the articles closest to those signals for each topic, summarizes them, and builds a digest.',
      label:
        'Feed articles and my posts are embedded and stored in D1, and the Worker scores similarity to build the daily digest',
      feeds: '28 feeds',
      feedsSub: 'Zenn, Hatena Bookmark, Hacker News…',
      own: 'My posts and likes',
      ownSub: 'signals of interest',
      space: 'Embedding space (1024 dimensions)',
      spaceSub: 'embedded with bge-m3, stored in D1, scored in the Worker',
      ownDot: 'my posts',
      nearDot: 'close articles',
      result: 'Daily digest at 6:30 JST',
      resultSub: 'up to 4 topics × 5 articles, summarized and pushed',
      notes: [
        'Embeddings are stored in BLOB columns of D1, and similarity is computed inside the Worker. There is no dedicated vector database.',
        'Weights decay over time so that newer signals count more.',
      ],
    },
    stack: { title: 'Stack', items: stack },
  },
} as const;

type Content = (typeof content)[Lang];

const figureStyle = `
.ifig{--ink:#5A5450;--sub:#7A746E;--line:#CFC8BC;--card:#FDF9F6;--accent:#C2785C;--accent-soft:#F6E6DD;--sage:#6B8567;--sage-soft:#E6EEE4;--sand:#F1E9DA;--blue:#4A7FB5;--blue-soft:#E3EDF7}
@media (prefers-color-scheme:dark){.ifig{--ink:#F0EEE9;--sub:#A39E96;--line:#5A5450;--card:#262321;--accent:#D49A82;--accent-soft:#4A332A;--sage:#8FA88B;--sage-soft:#2C382B;--sand:#3D3835;--blue:#7FB0DE;--blue-soft:#243648}}
.ifig .t{fill:var(--ink);font-size:13.5px;font-weight:700}
.ifig .m{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
.ifig .s{fill:var(--sub);font-size:11.5px}
.ifig .l{font-size:10.5px;font-weight:600}
.ifig .flow{stroke-dasharray:3 5;animation:ifig-dash 1s linear infinite}
@keyframes ifig-dash{to{stroke-dashoffset:-16}}
.ifig .halo{transform-box:fill-box;transform-origin:center;animation:ifig-pulse 3.2s ease-in-out infinite}
@keyframes ifig-pulse{0%,100%{transform:scale(.82)}50%{transform:scale(1.08)}}
@media (prefers-reduced-motion:reduce){.ifig .halo{animation:none}}
@media (prefers-reduced-motion:reduce){.ifig .flow{animation:none}.ifig .pk{display:none}}
`;

const tones: Record<Tone, { readonly fill: string; readonly stroke: string }> = {
  worker: { fill: 'var(--accent-soft)', stroke: 'var(--accent)' },
  fedi: { fill: 'var(--sage-soft)', stroke: 'var(--sage)' },
  bsky: { fill: 'var(--blue-soft)', stroke: 'var(--blue)' },
  store: { fill: 'var(--sand)', stroke: 'var(--line)' },
  plain: { fill: 'var(--card)', stroke: 'var(--line)' },
};

const colors = {
  accent: 'var(--accent)',
  sage: 'var(--sage)',
  blue: 'var(--blue)',
  sub: 'var(--sub)',
} as const;

type BoxProps = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly tone: Tone;
  readonly title: string;
  readonly sub?: string;
  readonly mono?: boolean;
};

const Box = ({ x, y, w, h, tone, title, sub, mono }: BoxProps) => (
  <g>
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx='10'
      fill={tones[tone].fill}
      stroke={tones[tone].stroke}
      stroke-width='1.25'
    />
    <text x={x + w / 2} y={sub ? y + h / 2 - 3 : y + h / 2 + 4.5} text-anchor='middle' class={mono ? 't m' : 't'}>
      {title}
    </text>
    {sub && <text x={x + w / 2} y={y + h / 2 + 13} text-anchor='middle' class='s'>{sub}</text>}
  </g>
);

const Line = ({ d, marker, both }: { d: string; marker: string; both?: boolean }) => (
  <path
    d={d}
    fill='none'
    stroke={colors.sub}
    stroke-width='1.4'
    stroke-linecap='round'
    class='flow'
    marker-end={`url(#${marker})`}
    marker-start={both ? `url(#${marker})` : undefined}
  />
);

const Label = (
  { x, y, color, anchor, children }: {
    x: number;
    y: number;
    color: string;
    anchor?: 'start' | 'middle' | 'end';
    children: Child;
  },
) => <text x={x} y={y} fill={color} text-anchor={anchor ?? 'start'} class='l'>{children}</text>;

const fraction = (value: number) => value.toFixed(3);

const Packet = (
  { d, cycle, from, to, color }: { d: string; cycle: number; from: number; to: number; color: string },
) => (
  <circle r='4' fill={color} opacity='0' class='pk'>
    <animateMotion
      dur={`${cycle}s`}
      repeatCount='indefinite'
      path={d}
      calcMode='linear'
      keyPoints='0;0;1;1'
      keyTimes={`0;${fraction(from)};${fraction(to)};1`}
    />
    <animate
      attributeName='opacity'
      dur={`${cycle}s`}
      repeatCount='indefinite'
      values='0;0;1;1;0;0'
      keyTimes={`0;${fraction(from)};${fraction(from + 0.015)};${fraction(to - 0.015)};${fraction(to)};1`}
    />
  </circle>
);

const Diagram = (
  { id, height, label, children }: { id: string; height: number; label: string; children: Child },
) => (
  <figure class='my-5 -mx-2 rounded-xl bg-warm-white py-4 dark:bg-gray-900/40 sm:mx-0 sm:px-4'>
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`0 0 400 ${height}`}
      role='img'
      aria-label={label}
      class='ifig mx-auto block w-full max-w-[460px]'
    >
      <defs>
        <marker
          id={id}
          viewBox='0 0 8 8'
          refX='6.5'
          refY='4'
          markerWidth='6'
          markerHeight='6'
          orient='auto-start-reverse'
        >
          <path d='M0.5 0.8 L7 4 L0.5 7.2 z' fill={colors.sub} />
        </marker>
      </defs>
      {children}
    </svg>
  </figure>
);

const Notes = ({ items }: { items: readonly string[] }) => (
  <ul class={listClass}>
    {items.map((item) => <li key={item}>{item}</li>)}
  </ul>
);

const Section = (
  { title, description, notes, children }: {
    title: string;
    description: string;
    notes: readonly string[];
    children: Child;
  },
) => (
  <section class={cardClass}>
    <h3 class={h3Class}>{title}</h3>
    <p class={bodyClass}>{description}</p>
    {children}
    <Notes items={notes} />
  </section>
);

const Serverless = ({ t }: { t: Content['serverless'] }) => {
  const id = 'ifig-arrow-serverless';
  const http = 'M68 60 L68 97';
  const queues = 'M200 60 L200 97';
  const cron = 'M332 60 L332 97';
  const enqueue = 'M124 120 C134 120 134 110 134 100 L134 48 C134 40 136 35 141 35';
  const toD1 = 'M51.5 200 L51.5 237';
  const toR2 = 'M150.5 200 L150.5 237';
  const toKv = 'M249.5 200 L249.5 237';
  const toAi = 'M348.5 200 L348.5 237';
  return (
    <Diagram id={id} height={298} label={t.label}>
      <Box x={12} y={10} w={112} h={50} tone='fedi' title='HTTP' sub={t.http} />
      <Box x={144} y={10} w={112} h={50} tone='store' title='Queues' sub={t.queues} />
      <Box x={276} y={10} w={112} h={50} tone='store' title='Cron Triggers' sub={t.cron} />
      <rect
        x='4'
        y='88'
        width='392'
        height='112'
        rx='14'
        fill={tones.worker.fill}
        stroke={tones.worker.stroke}
        stroke-width='1.5'
      />
      <text x='20' y='186' class='t'>{t.worker}</text>
      <text x='380' y='186' text-anchor='end' class='s'>Hono + Fedify</text>
      <Box x={12} y={100} w={112} h={56} tone='plain' title='fetch' sub={t.fetch} mono />
      <Box x={144} y={100} w={112} h={56} tone='plain' title='queue' sub={t.queue} mono />
      <Box x={276} y={100} w={112} h={56} tone='plain' title='scheduled' sub={t.scheduled} mono />
      <Line d={http} marker={id} />
      <Line d={queues} marker={id} />
      <Line d={cron} marker={id} />
      <Line d={enqueue} marker={id} />
      <Label x={139} y={80} color={colors.accent}>{t.enqueue}</Label>
      <Box x={4} y={240} w={95} h={50} tone='store' title='D1' sub={t.d1} />
      <Box x={103} y={240} w={95} h={50} tone='store' title='R2' sub={t.r2} />
      <Box x={202} y={240} w={95} h={50} tone='store' title='KV' sub={t.kv} />
      <Box x={301} y={240} w={95} h={50} tone='store' title='Workers AI' sub={t.ai} />
      <Line d={toD1} marker={id} both />
      <Line d={toR2} marker={id} both />
      <Line d={toKv} marker={id} both />
      <Line d={toAi} marker={id} both />
      <Packet d={http} cycle={7} from={0.02} to={0.12} color={colors.sage} />
      <Packet d={toD1} cycle={7} from={0.13} to={0.23} color={colors.accent} />
      <Packet d={enqueue} cycle={7} from={0.24} to={0.38} color={colors.accent} />
      <Packet d={queues} cycle={7} from={0.4} to={0.5} color={colors.accent} />
      <Packet d={toKv} cycle={7} from={0.51} to={0.61} color={colors.accent} />
      <Packet d={cron} cycle={7} from={0.66} to={0.76} color={colors.accent} />
      <Packet d={toAi} cycle={7} from={0.77} to={0.87} color={colors.accent} />
    </Diagram>
  );
};

const Delivery = ({ t }: { t: Content['delivery'] }) => {
  const id = 'ifig-arrow-delivery';
  const post = 'M200 48 L200 73';
  const toD1 = 'M160 124 C160 150 68 144 68 167';
  const toQueues = 'M200 124 L200 167';
  const toBluesky = 'M240 124 C240 150 332 144 332 167';
  const toQueue = 'M200 214 L200 241';
  const retry = 'M261 256 C284 250 284 282 263 278';
  const left = 'M200 288 C200 308 88 302 88 323';
  const center = 'M200 288 L200 323';
  const right = 'M200 288 C200 308 312 302 312 323';
  return (
    <Diagram id={id} height={392} label={t.label}>
      <Box x={130} y={8} w={140} h={40} tone='plain' title={t.note} />
      <Box x={110} y={76} w={180} h={48} tone='worker' title='fetch' sub={t.worker} mono />
      <Line d={post} marker={id} />
      <Line d={toD1} marker={id} />
      <Line d={toQueues} marker={id} />
      <Line d={toBluesky} marker={id} />
      <rect
        x='8'
        y='170'
        width='120'
        height='96'
        rx='10'
        fill={tones.store.fill}
        stroke={tones.store.stroke}
        stroke-width='1.25'
      />
      <text x='68' y='189' text-anchor='middle' class='t'>D1</text>
      <rect x='16' y='198' width='104' height='26' rx='6' fill='var(--card)' stroke='var(--line)' />
      <text x='68' y='215' text-anchor='middle' class='t m'>posts</text>
      <rect x='16' y='230' width='104' height='26' rx='6' fill='var(--card)' stroke='var(--line)' />
      <text x='68' y='247' text-anchor='middle' class='t m'>domain_events</text>
      <Label x={68} y={282} color={colors.sub} anchor='middle'>{t.batch}</Label>
      <Box x={140} y={170} w={120} h={44} tone='store' title='Queues' sub={t.queues} />
      <Box x={272} y={170} w={120} h={44} tone='bsky' title='Bluesky' sub={t.bluesky} />
      <Label x={340} y={158} color={colors.blue}>AT Protocol</Label>
      <Line d={toQueue} marker={id} />
      <Label x={208} y={232} color={colors.sage}>ActivityPub</Label>
      <Box x={140} y={244} w={120} h={44} tone='worker' title='queue' sub={t.queue} mono />
      <Line d={retry} marker={id} />
      <Label x={286} y={270} color={colors.sub}>{t.retry}</Label>
      <Line d={left} marker={id} />
      <Line d={center} marker={id} />
      <Line d={right} marker={id} />
      <Box x={38} y={326} w={100} h={36} tone='fedi' title='Mastodon' />
      <Box x={150} y={326} w={100} h={36} tone='fedi' title='Misskey' />
      <Box x={262} y={326} w={100} h={36} tone='fedi' title={t.others} />
      <Label x={200} y={382} color={colors.sage} anchor='middle'>{t.followers}</Label>
      <Packet d={post} cycle={7} from={0.02} to={0.1} color={colors.accent} />
      <Packet d={toD1} cycle={7} from={0.12} to={0.24} color={colors.accent} />
      <Packet d={toQueues} cycle={7} from={0.12} to={0.22} color={colors.sage} />
      <Packet d={toBluesky} cycle={7} from={0.28} to={0.42} color={colors.blue} />
      <Packet d={toQueue} cycle={7} from={0.3} to={0.38} color={colors.sage} />
      <Packet d={left} cycle={7} from={0.42} to={0.56} color={colors.sage} />
      <Packet d={center} cycle={7} from={0.46} to={0.56} color={colors.sage} />
      <Packet d={right} cycle={7} from={0.5} to={0.64} color={colors.sage} />
    </Diagram>
  );
};

const Timeline = ({ t }: { t: Content['timeline'] }) => {
  const id = 'ifig-arrow-timeline';
  const push = 'M100 54 L100 89';
  const ask = 'M290 92 L290 57';
  const pull = 'M310 54 L310 89';
  const toQueues = 'M100 138 L100 173';
  const fediToD1 = 'M100 222 C100 246 160 238 160 259';
  const bskyToD1 = 'M300 138 C300 222 240 232 240 259';
  const toHome = 'M200 308 L200 333';
  return (
    <Diagram id={id} height={390} label={t.label}>
      <Box x={16} y={8} w={168} h={46} tone='fedi' title={t.fediverse} sub={t.pushed} />
      <Box x={216} y={8} w={168} h={46} tone='bsky' title='Bluesky' sub={t.pulled} />
      <Line d={push} marker={id} />
      <Label x={108} y={77} color={colors.sage}>ActivityPub</Label>
      <Line d={ask} marker={id} />
      <Line d={pull} marker={id} />
      <Label x={318} y={77} color={colors.blue}>AT Protocol</Label>
      <Box x={16} y={92} w={168} h={46} tone='worker' title='fetch' sub={t.fetch} mono />
      <Box x={216} y={92} w={168} h={46} tone='worker' title='scheduled' sub={t.scheduled} mono />
      <Line d={toQueues} marker={id} />
      <Box x={16} y={176} w={168} h={46} tone='store' title='Queues' sub={t.queues} />
      <Line d={fediToD1} marker={id} />
      <Line d={bskyToD1} marker={id} />
      <Box x={96} y={262} w={208} h={46} tone='store' title='D1' sub={t.d1} />
      <Line d={toHome} marker={id} />
      <Box x={76} y={336} w={248} h={46} tone='plain' title={t.home} sub={t.merged} />
      <Packet d={push} cycle={8} from={0.02} to={0.1} color={colors.sage} />
      <Packet d={toQueues} cycle={8} from={0.11} to={0.19} color={colors.sage} />
      <Packet d={fediToD1} cycle={8} from={0.2} to={0.3} color={colors.sage} />
      <Packet d={toHome} cycle={8} from={0.31} to={0.39} color={colors.sage} />
      <Packet d={ask} cycle={8} from={0.46} to={0.54} color={colors.accent} />
      <Packet d={pull} cycle={8} from={0.55} to={0.63} color={colors.blue} />
      <Packet d={bskyToD1} cycle={8} from={0.64} to={0.8} color={colors.blue} />
      <Packet d={toHome} cycle={8} from={0.81} to={0.89} color={colors.blue} />
    </Diagram>
  );
};

const Events = ({ t }: { t: Content['events'] }) => {
  const id = 'ifig-arrow-events';
  const call = 'M200 50 L200 75';
  const emit = 'M200 126 L200 175';
  const toState = 'M170 220 C170 242 104 236 104 255';
  const toRecord = 'M230 220 C230 242 296 236 296 255';
  return (
    <Diagram id={id} height={336} label={t.label}>
      <Box x={120} y={8} w={160} h={42} tone='plain' title='useCase' sub={t.useCase} mono />
      <Line d={call} marker={id} />
      <Box x={100} y={78} w={200} h={48} tone='worker' title='domain' sub={t.domain} mono />
      <Line d={emit} marker={id} />
      <rect x='212' y='139' width='104' height='24' rx='12' fill='var(--card)' stroke='var(--accent)' />
      <text x='264' y='155' text-anchor='middle' fill='var(--accent)' class='m'>post.created</text>
      <Box x={120} y={178} w={160} h={42} tone='plain' title='store' sub={t.store} mono />
      <rect
        x='8'
        y='246'
        width='384'
        height='82'
        rx='12'
        fill='none'
        stroke='var(--accent)'
        stroke-width='1.25'
        stroke-dasharray='5 4'
      />
      <Line d={toState} marker={id} />
      <Line d={toRecord} marker={id} />
      <Box x={20} y={258} w={168} h={44} tone='store' title='posts' sub={t.state} mono />
      <Box x={212} y={258} w={168} h={44} tone='store' title='domain_events' sub={t.record} mono />
      <Label x={200} y={319} color={colors.accent} anchor='middle'>{t.batch}</Label>
      <Packet d={call} cycle={5} from={0.03} to={0.15} color={colors.accent} />
      <Packet d={emit} cycle={5} from={0.2} to={0.38} color={colors.accent} />
      <Packet d={toState} cycle={5} from={0.44} to={0.62} color={colors.accent} />
      <Packet d={toRecord} cycle={5} from={0.44} to={0.62} color={colors.accent} />
    </Diagram>
  );
};

const Digest = ({ t }: { t: Content['digest'] }) => {
  const id = 'ifig-arrow-digest';
  const feedA = 'M86 54 L86 89';
  const feedB = 'M126 54 L126 89';
  const feedC = 'M166 54 L166 89';
  const own = 'M324 54 L324 89';
  const toResult = 'M200 290 L200 333';
  const others = [
    [40, 140],
    [70, 150],
    [30, 190],
    [60, 230],
    [45, 252],
    [120, 240],
    [150, 228],
    [140, 198],
    [160, 170],
    [170, 130],
    [190, 200],
    [200, 160],
    [210, 240],
    [255, 225],
    [285, 250],
    [330, 180],
    [340, 140],
    [350, 252],
    [372, 240],
  ] as const;
  const mine = [[110, 170], [250, 150], [300, 215]] as const;
  const near = [[128, 152], [92, 188], [232, 138], [268, 170], [318, 232]] as const;
  return (
    <Diagram id={id} height={388} label={t.label}>
      <Box x={8} y={8} w={236} h={46} tone='plain' title={t.feeds} sub={t.feedsSub} />
      <Box x={256} y={8} w={136} h={46} tone='fedi' title={t.own} sub={t.ownSub} />
      <Line d={feedA} marker={id} />
      <Line d={feedB} marker={id} />
      <Line d={feedC} marker={id} />
      <Line d={own} marker={id} />
      <rect x='8' y='92' width='384' height='198' rx='12' fill='var(--card)' stroke='var(--line)' stroke-width='1.25' />
      <Label x={20} y={112} color={colors.sub}>{t.space}</Label>
      {mine.map(([cx, cy]) => (
        <circle key={`halo-${cx}`} cx={cx} cy={cy} r='32' fill='var(--sage)' opacity='0.16' class='halo' />
      ))}
      {others.map(([cx, cy]) => <circle key={`o-${cx}-${cy}`} cx={cx} cy={cy} r='3' fill='var(--line)' />)}
      {near.map(([cx, cy]) => <circle key={`n-${cx}-${cy}`} cx={cx} cy={cy} r='4.5' fill='var(--accent)' />)}
      {mine.map(([cx, cy]) => (
        <circle
          key={`m-${cx}`}
          cx={cx}
          cy={cy}
          r='5.5'
          fill='var(--sage)'
          stroke='var(--card)'
          stroke-width='1.5'
        />
      ))}
      <Label x={311} y={211} color={colors.sage}>{t.ownDot}</Label>
      <Label x={137} y={147} color={colors.accent}>{t.nearDot}</Label>
      <text x='200' y='279' text-anchor='middle' class='s'>{t.spaceSub}</text>
      <Line d={toResult} marker={id} />
      <Box x={8} y={336} w={384} h={46} tone='worker' title={t.result} sub={t.resultSub} />
      <Packet d={feedA} cycle={8} from={0.02} to={0.1} color={colors.sub} />
      <Packet d={feedB} cycle={8} from={0.05} to={0.13} color={colors.sub} />
      <Packet d={feedC} cycle={8} from={0.08} to={0.16} color={colors.sub} />
      <Packet d={own} cycle={8} from={0.06} to={0.14} color={colors.sage} />
      {near.map(([cx, cy], index) => (
        <Packet
          key={`p-${cx}`}
          d={`M${cx} ${cy} C${cx} 290 200 280 200 333`}
          cycle={8}
          from={0.3 + index * 0.08}
          to={0.52 + index * 0.08}
          color={colors.accent}
        />
      ))}
    </Diagram>
  );
};

const Legend = ({ t }: { t: Content['legend'] }) => (
  <ul class='ifig flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-charcoal-light dark:text-gray-400'>
    {(['worker', 'fedi', 'bsky', 'store'] as const).map((tone) => (
      <li key={tone} class='flex items-center gap-1.5'>
        <span
          class='inline-block h-3 w-4 rounded'
          style={`background:${tones[tone].fill};border:1.25px solid ${tones[tone].stroke}`}
        />
        {t[tone]}
      </li>
    ))}
  </ul>
);

const Stack = ({ t }: { t: Content['stack'] }) => (
  <section class={cardClass}>
    <h3 class={h3Class}>{t.title}</h3>
    <dl class='grid gap-3 sm:grid-cols-2'>
      {t.items.map((item) => (
        <div key={item.name} class={`${insetClass} p-3`}>
          <dt class='text-sm text-charcoal-light dark:text-gray-400'>{item.name}</dt>
          <dd class='font-medium text-charcoal dark:text-white'>{item.value}</dd>
        </div>
      ))}
    </dl>
  </section>
);

export const AboutArchitecture = ({ lang }: { lang: Lang }) => {
  const t = content[lang];
  return (
    <section class='space-y-6'>
      <style>{figureStyle}</style>
      <div class='pt-6 px-2'>
        <h2 class='text-2xl font-bold text-charcoal dark:text-white mb-2'>{t.title}</h2>
        <p class={bodyClass}>{t.intro}</p>
        <Legend t={t.legend} />
      </div>
      <Section title={t.serverless.title} description={t.serverless.description} notes={t.serverless.notes}>
        <Serverless t={t.serverless} />
      </Section>
      <Section title={t.delivery.title} description={t.delivery.description} notes={t.delivery.notes}>
        <Delivery t={t.delivery} />
      </Section>
      <Section title={t.timeline.title} description={t.timeline.description} notes={t.timeline.notes}>
        <Timeline t={t.timeline} />
      </Section>
      <Section title={t.events.title} description={t.events.description} notes={t.events.notes}>
        <Events t={t.events} />
      </Section>
      <Section title={t.digest.title} description={t.digest.description} notes={t.digest.notes}>
        <Digest t={t.digest} />
      </Section>
      <Stack t={t.stack} />
    </section>
  );
};
