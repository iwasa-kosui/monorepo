import type { Child } from 'hono/jsx';

type Lang = 'ja' | 'en';
type NodeKind = 'external' | 'worker' | 'service';
type FlowNode = { readonly name: string; readonly description?: string; readonly kind: NodeKind };

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
    intro: 'iori がどのように動いているかを、図で説明します。',
    overview: {
      title: '全体像',
      description:
        'iori は Cloudflare の上で、1つの Worker として動いています。常時起動しているサーバーはなく、リクエストやメッセージが届いたときだけプログラムが動きます。Worker には3つの入口があり、データの保存や配送は Cloudflare の各サービスに任せています。',
      caption: 'iori の全体構成',
      externals: [
        { name: 'ブラウザ', description: '読む人、書く人' },
        { name: '他のサーバー', description: 'Mastodon、Misskey など' },
        { name: 'Bluesky', description: 'AT Protocol' },
      ],
      arrowLabel: 'HTTPS',
      worker: { name: 'iori の Worker', description: 'Hono + Fedify' },
      entries: [
        { name: 'fetch', description: 'HTTP リクエストに応答する' },
        { name: 'queue', description: 'キューのメッセージを処理する' },
        { name: 'scheduled', description: 'Cron Triggers が起動する定期処理' },
      ],
      services: [
        { name: 'D1', description: 'データベース。投稿やフォローなど、すべてのデータ' },
        { name: 'R2', description: '画像の保存' },
        { name: 'Queues', description: '連合の配送を順に処理するキュー' },
        { name: 'KV', description: '連合で使う一時的なデータ' },
        { name: 'Workers AI', description: '要約、翻訳、bot の発言' },
        { name: 'Workers Assets', description: '画面の JavaScript の配信' },
      ],
      legend: { external: '外部', worker: 'Worker', service: 'Cloudflare のサービス' },
    },
    page: {
      title: 'ページを開いたとき',
      description:
        '画面は、ブラウザの中で JavaScript が描画します。Worker が返すのは HTML の枠だけで、表示するデータは API から取得します。',
      caption: 'ページを表示するまでの流れ',
      steps: [
        {
          from: { name: 'ブラウザ', kind: 'external' },
          to: { name: 'Worker', kind: 'worker' },
          text: 'ページを要求します。Worker は HTML の枠を返します。',
        },
        {
          from: { name: 'ブラウザ', kind: 'external' },
          to: { name: 'Workers Assets', kind: 'service' },
          text: '画面の JavaScript を取得します。この通信は Worker を経由しません。',
        },
        {
          from: { name: 'ブラウザ', kind: 'external' },
          to: { name: 'Worker', kind: 'worker' },
          text: 'JavaScript が API を呼びます。',
        },
        {
          from: { name: 'Worker', kind: 'worker' },
          to: { name: 'D1', kind: 'service' },
          text: 'Worker はデータを読み書きし、結果を JSON で返します。',
        },
      ],
      notes: [
        'API は、Mastodon 互換 API と iori 独自の API の2種類です。',
        'Mastodon 互換 API があるので、Mastodon 用のクライアントアプリも同じ API を使えます。',
      ],
    },
    delivery: {
      title: '投稿が Fediverse に届くまで',
      description:
        '投稿の保存と、他のサーバーへの配送を分けています。配送はキューに積み、利用者に応答を返したあとで処理します。フォロワーのサーバーが応答しなくても、投稿そのものは失敗しません。',
      flows: [
        {
          caption: '送信: 自分の投稿をフォロワーに届ける',
          nodes: [
            { name: '利用者', description: 'ノートを投稿する', kind: 'external' },
            { name: 'Worker (fetch)', description: 'D1 に保存し、配送をキューに積む', kind: 'worker' },
            { name: 'Queues', description: '配送を1件ずつ渡す', kind: 'service' },
            { name: 'Worker (queue)', description: '署名して送信する', kind: 'worker' },
            { name: 'フォロワーのサーバー', description: '投稿を受け取る', kind: 'external' },
          ],
        },
        {
          caption: '受信: 他のサーバーの投稿を受け取る',
          nodes: [
            { name: '他のサーバー', description: '投稿やフォローを送る', kind: 'external' },
            { name: 'Worker (fetch)', description: '署名を検証し、キューに積む', kind: 'worker' },
            { name: 'Queues', description: '処理を1件ずつ渡す', kind: 'service' },
            { name: 'Worker (queue)', description: 'D1 にタイムラインと通知を保存する', kind: 'worker' },
            { name: '利用者', description: 'Web Push で通知を受け取る', kind: 'external' },
          ],
        },
      ],
      notes: [
        '失敗した配送は、間隔を空けて再試行します。',
        '再試行しても届かなかったメッセージは、別のキュー（DLQ）に移します。',
        '署名に使う鍵は、D1 に保存しています。',
      ],
    },
    schedule: {
      title: '定期処理と Bluesky',
      description:
        'Cron Triggers が決まった間隔で Worker を起動します。Bluesky とのやり取りも、この定期処理を使っています。',
      caption: '定期処理の間隔と内容',
      rows: [
        {
          interval: '毎分',
          items: ['Bluesky のタイムラインと通知を取り込む', 'bot がメンションに返信する'],
        },
        {
          interval: '3時間ごと',
          items: [
            'RSS などのフィードを収集する',
            '失敗した Bluesky への同時投稿を再送する',
            '保持期間を過ぎた Bluesky のタイムラインを削除する',
          ],
        },
        {
          interval: '毎日',
          items: ['日次ダイジェストを作成する'],
        },
      ],
      notes: [
        'Bluesky への同時投稿は、投稿の応答を返した直後に送信します。',
        '取り込んだ Bluesky のタイムラインは、30日間保持します。',
        'Bluesky のアプリパスワードは、暗号化して D1 に保存しています。',
      ],
    },
    code: {
      title: 'コードの構造',
      description:
        'コードは役割ごとに層を分けています。依存は上の層から下の層へ向かい、ルールを書く domain は外部のサービスに依存しません。',
      layersCaption: '層と依存の向き',
      routes: { name: 'adaptor/routes', description: 'HTTP の入口。入力を検証してユースケースを呼ぶ' },
      useCase: { name: 'useCase', description: '業務の流れ。認可、保存、配送の依頼を順に実行する' },
      domain: { name: 'domain', description: 'ルールとデータの形。外部に依存しない' },
      adaptor: {
        name: 'adaptor/d1 など',
        description: 'データベースや外部サービスとの接続。domain が定義した型を実装する',
      },
      implementLabel: '実装する',
      writeCaption: '1回の書き込み',
      write: { name: '投稿を保存する', description: 'ストアが1つのバッチにまとめる' },
      tables: { name: '状態のテーブル', description: 'posts など。画面はここを読む' },
      events: { name: 'domain_events', description: '何が起きたかの記録' },
      notes: [
        '状態の変更は、ドメインイベントとして記録します。状態とイベントは、同じバッチで D1 に書き込みます。',
        'イベントは、投稿の編集履歴の表示などに使います。',
        'エラーは例外を投げず、Result 型の値として返します。',
        'データの形は Zod のスキーマで定義し、型をスキーマから導出します。',
      ],
    },
    deploy: {
      title: 'デプロイ',
      description: 'main ブランチへの merge をきっかけに、GitHub Actions が本番へデプロイします。',
      caption: 'デプロイの流れ',
      nodes: [
        { name: 'main に merge', kind: 'external' },
        { name: 'ビルドと検査', description: 'GitHub Actions', kind: 'external' },
        { name: '承認', description: '人が確認する', kind: 'external' },
        { name: 'マイグレーション', description: 'D1 のスキーマを更新する', kind: 'service' },
        { name: 'デプロイ', description: '新しい Worker を公開する', kind: 'worker' },
      ],
      notes: [
        'D1、R2、KV、Queues は Terraform で管理しています。',
        'Worker の本体と設定は Wrangler で管理しています。',
        'マイグレーションが失敗した場合、Worker はデプロイしません。',
      ],
    },
    stack: {
      title: '使っている技術',
      items: stack,
    },
  },
  en: {
    title: 'How it works',
    intro: 'This section explains how iori works, with diagrams.',
    overview: {
      title: 'Overview',
      description:
        'iori runs as a single Worker on Cloudflare. No server stays running. The program runs only when a request or a message arrives. The Worker has three entry points, and it leaves data storage and delivery to Cloudflare services.',
      caption: 'Overall architecture of iori',
      externals: [
        { name: 'Browser', description: 'Readers and writers' },
        { name: 'Other servers', description: 'Mastodon, Misskey, and others' },
        { name: 'Bluesky', description: 'AT Protocol' },
      ],
      arrowLabel: 'HTTPS',
      worker: { name: 'iori Worker', description: 'Hono + Fedify' },
      entries: [
        { name: 'fetch', description: 'Responds to HTTP requests' },
        { name: 'queue', description: 'Processes queue messages' },
        { name: 'scheduled', description: 'Periodic jobs started by Cron Triggers' },
      ],
      services: [
        { name: 'D1', description: 'Database. All data, such as posts and follows' },
        { name: 'R2', description: 'Image storage' },
        { name: 'Queues', description: 'A queue that processes federation deliveries in order' },
        { name: 'KV', description: 'Temporary data used by federation' },
        { name: 'Workers AI', description: 'Summaries, translation, and bot replies' },
        { name: 'Workers Assets', description: 'Serves the JavaScript for the screens' },
      ],
      legend: { external: 'External', worker: 'Worker', service: 'Cloudflare services' },
    },
    page: {
      title: 'Opening a page',
      description:
        'JavaScript in the browser renders the screens. The Worker returns only a frame of HTML, and the data to display comes from the API.',
      caption: 'From request to rendered page',
      steps: [
        {
          from: { name: 'Browser', kind: 'external' },
          to: { name: 'Worker', kind: 'worker' },
          text: 'Requests the page. The Worker returns a frame of HTML.',
        },
        {
          from: { name: 'Browser', kind: 'external' },
          to: { name: 'Workers Assets', kind: 'service' },
          text: 'Fetches the JavaScript for the screens. This request does not go through the Worker.',
        },
        {
          from: { name: 'Browser', kind: 'external' },
          to: { name: 'Worker', kind: 'worker' },
          text: 'The JavaScript calls the API.',
        },
        {
          from: { name: 'Worker', kind: 'worker' },
          to: { name: 'D1', kind: 'service' },
          text: 'The Worker reads and writes data, and returns the result as JSON.',
        },
      ],
      notes: [
        'The API comes in two kinds: the Mastodon-compatible API and iori\'s own API.',
        'Because the Mastodon-compatible API exists, client apps made for Mastodon can use the same API.',
      ],
    },
    delivery: {
      title: 'Delivering a post to the Fediverse',
      description:
        'Saving a post and delivering it to other servers are separate steps. Deliveries go into a queue and are processed after the response returns to the user. Even if a follower\'s server does not respond, the post itself does not fail.',
      flows: [
        {
          caption: 'Sending: delivering my post to followers',
          nodes: [
            { name: 'User', description: 'Posts a note', kind: 'external' },
            { name: 'Worker (fetch)', description: 'Saves to D1 and queues the delivery', kind: 'worker' },
            { name: 'Queues', description: 'Hands over deliveries one by one', kind: 'service' },
            { name: 'Worker (queue)', description: 'Signs and sends', kind: 'worker' },
            { name: 'Follower\'s server', description: 'Receives the post', kind: 'external' },
          ],
        },
        {
          caption: 'Receiving: receiving posts from other servers',
          nodes: [
            { name: 'Other server', description: 'Sends posts and follows', kind: 'external' },
            { name: 'Worker (fetch)', description: 'Verifies the signature and queues it', kind: 'worker' },
            { name: 'Queues', description: 'Hands over items one by one', kind: 'service' },
            { name: 'Worker (queue)', description: 'Saves timelines and notifications to D1', kind: 'worker' },
            { name: 'User', description: 'Receives notifications via Web Push', kind: 'external' },
          ],
        },
      ],
      notes: [
        'Failed deliveries are retried at intervals.',
        'Messages that still fail after retries move to a separate queue (DLQ).',
        'The keys used for signing are stored in D1.',
      ],
    },
    schedule: {
      title: 'Scheduled jobs and Bluesky',
      description:
        'Cron Triggers start the Worker at set intervals. Exchanges with Bluesky also use these scheduled jobs.',
      caption: 'Schedule intervals and jobs',
      rows: [
        {
          interval: 'Every minute',
          items: ['Imports the Bluesky timeline and notifications', 'The bot replies to mentions'],
        },
        {
          interval: 'Every 3 hours',
          items: [
            'Collects feeds such as RSS',
            'Resends failed cross-posts to Bluesky',
            'Deletes Bluesky timeline items past the retention period',
          ],
        },
        {
          interval: 'Every day',
          items: ['Creates the daily digest'],
        },
      ],
      notes: [
        'Cross-posts to Bluesky are sent right after the response for the post returns.',
        'The imported Bluesky timeline is kept for 30 days.',
        'The Bluesky app password is encrypted and stored in D1.',
      ],
    },
    code: {
      title: 'Code structure',
      description:
        'The code is split into layers by role. Dependencies point from upper layers to lower layers, and domain, which holds the rules, does not depend on external services.',
      layersCaption: 'Layers and the direction of dependencies',
      routes: { name: 'adaptor/routes', description: 'HTTP entry point. Validates input and calls use cases' },
      useCase: {
        name: 'useCase',
        description: 'Business flow. Runs authorization, saving, and delivery requests in order',
      },
      domain: { name: 'domain', description: 'Rules and the shape of data. Depends on nothing external' },
      adaptor: {
        name: 'adaptor/d1 and others',
        description: 'Connections to the database and external services. Implements the types that domain defines',
      },
      implementLabel: 'Implements',
      writeCaption: 'One write',
      write: { name: 'Save a post', description: 'The store puts it into one batch' },
      tables: { name: 'State tables', description: 'posts and others. Screens read from here' },
      events: { name: 'domain_events', description: 'A record of what happened' },
      notes: [
        'State changes are recorded as domain events. The state and the event are written to D1 in the same batch.',
        'Events are used for things such as showing a post\'s edit history.',
        'Errors are returned as Result values, not thrown as exceptions.',
        'The shape of data is defined by Zod schemas, and types are derived from the schemas.',
      ],
    },
    deploy: {
      title: 'Deployment',
      description: 'A merge into the main branch triggers GitHub Actions to deploy to production.',
      caption: 'Deployment flow',
      nodes: [
        { name: 'Merge into main', kind: 'external' },
        { name: 'Build and checks', description: 'GitHub Actions', kind: 'external' },
        { name: 'Approval', description: 'A person reviews', kind: 'external' },
        { name: 'Migration', description: 'Updates the D1 schema', kind: 'service' },
        { name: 'Deploy', description: 'Publishes the new Worker', kind: 'worker' },
      ],
      notes: [
        'D1, R2, KV, and Queues are managed with Terraform.',
        'The Worker code and its configuration are managed with Wrangler.',
        'If the migration fails, the Worker is not deployed.',
      ],
    },
    stack: {
      title: 'Stack',
      items: stack,
    },
  },
} as const;

const nodeKindClass: Record<NodeKind, string> = {
  external: 'border border-sage dark:border-sage-dark bg-sage/15 dark:bg-sage/10',
  worker: 'border-2 border-terracotta bg-terracotta/10 dark:bg-terracotta/15',
  service: 'border border-warm-gray-dark dark:border-gray-600 bg-sand-light/50 dark:bg-gray-700/50',
};

const rightArrowPath = 'M5 12h14M13 6l6 6-6 6';
const verticalArrowPaths = {
  down: 'M12 5v14M6 13l6 6 6-6',
  up: 'M12 19V5M6 11l6-6 6 6',
  both: 'M12 3v18M6 9l6-6 6 6M6 15l6 6 6-6',
} as const;

const ArrowSvg = ({ d, class: className }: { d: string; class: string }) => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    aria-hidden='true'
    class={className}
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    stroke-width='2'
  >
    <path stroke-linecap='round' stroke-linejoin='round' d={d} />
  </svg>
);

const Node = (
  { name, description, kind, class: className = '', children }: {
    name: string;
    description?: string;
    kind: NodeKind;
    class?: string;
    children?: Child;
  },
) => (
  <div class={`rounded-xl px-3 py-2 text-center ${nodeKindClass[kind]} ${className}`}>
    <p class='text-sm font-bold text-charcoal dark:text-white break-words'>{name}</p>
    {description && <p class='text-xs text-charcoal-light dark:text-gray-400 break-words'>{description}</p>}
    {children}
  </div>
);

const FlowArrow = ({ label }: { label?: string }) => (
  <div
    aria-hidden='true'
    class='flex shrink-0 items-center justify-center gap-1 text-charcoal-light dark:text-gray-500'
  >
    <ArrowSvg d={rightArrowPath} class='h-5 w-5 rotate-90 sm:rotate-0' />
    {label && <span class='text-xs'>{label}</span>}
  </div>
);

const VerticalArrow = (
  { direction, label }: { direction: keyof typeof verticalArrowPaths; label?: string },
) => (
  <div
    aria-hidden='true'
    class='flex items-center justify-center gap-2 py-2 text-charcoal-light dark:text-gray-500'
  >
    <ArrowSvg d={verticalArrowPaths[direction]} class='h-5 w-5' />
    {label && <span class='text-xs'>{label}</span>}
  </div>
);

const Figure = ({ caption, children }: { caption: string; children: Child }) => (
  <figure class='bg-sand-light/30 dark:bg-gray-900/30 rounded-xl p-4'>
    {children}
    <figcaption class='mt-3 text-xs text-center text-charcoal-light dark:text-gray-400'>{caption}</figcaption>
  </figure>
);

const FlowList = ({ nodes }: { nodes: readonly FlowNode[] }) => (
  <ol class='mx-auto flex max-w-md flex-col items-stretch gap-1'>
    {nodes.flatMap((node, index) => [
      ...(index > 0
        ? [
          <li
            key={`arrow-${node.name}`}
            aria-hidden='true'
            class='flex items-center justify-center text-charcoal-light dark:text-gray-500'
          >
            <ArrowSvg d={verticalArrowPaths.down} class='h-5 w-5' />
          </li>,
        ]
        : []),
      <li key={node.name} class='min-w-0'>
        <Node name={node.name} description={node.description} kind={node.kind} class='h-full' />
      </li>,
    ])}
  </ol>
);

const Step = (
  { number, from, to, text }: { number: number; from: FlowNode; to: FlowNode; text: string },
) => (
  <li class='flex gap-3'>
    <span class='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terracotta text-sm font-semibold text-white'>
      {number}
    </span>
    <div class='min-w-0 flex-1'>
      <div class='flex flex-col items-center gap-1 sm:flex-row'>
        <Node name={from.name} kind={from.kind} class='w-full sm:w-44' />
        <FlowArrow />
        <Node name={to.name} kind={to.kind} class='w-full sm:w-44' />
      </div>
      <p class='mt-2 text-sm text-charcoal-light dark:text-gray-400'>{text}</p>
    </div>
  </li>
);

const Notes = ({ items }: { items: readonly string[] }) => (
  <ul class={`${listClass} mt-4`}>
    {items.map((item) => <li key={item}>{item}</li>)}
  </ul>
);

const Legend = ({ labels }: { labels: Record<NodeKind, string> }) => (
  <ul class='mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-charcoal-light dark:text-gray-400'>
    {(['external', 'worker', 'service'] as const).map((kind) => (
      <li key={kind} class='flex items-center gap-1.5'>
        <span class={`inline-block h-3 w-5 rounded ${nodeKindClass[kind]}`} />
        {labels[kind]}
      </li>
    ))}
  </ul>
);

const Overview = ({ t }: { t: (typeof content)[Lang]['overview'] }) => (
  <section class={cardClass}>
    <h3 class={h3Class}>{t.title}</h3>
    <p class={`${bodyClass} mb-4`}>{t.description}</p>
    <Figure caption={t.caption}>
      <ul class='grid gap-2 sm:grid-cols-3'>
        {t.externals.map((node) => (
          <li key={node.name}>
            <Node name={node.name} description={node.description} kind='external' class='h-full' />
          </li>
        ))}
      </ul>
      <VerticalArrow direction='both' label={t.arrowLabel} />
      <Node name={t.worker.name} description={t.worker.description} kind='worker' class='w-full'>
        <ul class='mt-3 grid gap-2 sm:grid-cols-3'>
          {t.entries.map((entry) => (
            <li
              key={entry.name}
              class='rounded-lg border border-terracotta/40 bg-cream dark:bg-gray-800 px-2 py-1.5'
            >
              <p class='text-sm font-bold text-charcoal dark:text-white'>{entry.name}</p>
              <p class='text-xs text-charcoal-light dark:text-gray-400'>{entry.description}</p>
            </li>
          ))}
        </ul>
      </Node>
      <VerticalArrow direction='down' />
      <ul class='grid grid-cols-2 gap-2 sm:grid-cols-3'>
        {t.services.map((node) => (
          <li key={node.name}>
            <Node name={node.name} description={node.description} kind='service' class='h-full' />
          </li>
        ))}
      </ul>
      <Legend labels={t.legend} />
    </Figure>
  </section>
);

const PageLoad = ({ t }: { t: (typeof content)[Lang]['page'] }) => (
  <section class={cardClass}>
    <h3 class={h3Class}>{t.title}</h3>
    <p class={`${bodyClass} mb-4`}>{t.description}</p>
    <Figure caption={t.caption}>
      <ol class='space-y-4'>
        {t.steps.map((step, index) => (
          <Step key={step.text} number={index + 1} from={step.from} to={step.to} text={step.text} />
        ))}
      </ol>
    </Figure>
    <Notes items={t.notes} />
  </section>
);

const Delivery = ({ t }: { t: (typeof content)[Lang]['delivery'] }) => (
  <section class={cardClass}>
    <h3 class={h3Class}>{t.title}</h3>
    <p class={`${bodyClass} mb-4`}>{t.description}</p>
    <div class='space-y-4'>
      {t.flows.map((flow) => (
        <Figure key={flow.caption} caption={flow.caption}>
          <FlowList nodes={flow.nodes} />
        </Figure>
      ))}
    </div>
    <Notes items={t.notes} />
  </section>
);

const Schedule = ({ t }: { t: (typeof content)[Lang]['schedule'] }) => (
  <section class={cardClass}>
    <h3 class={h3Class}>{t.title}</h3>
    <p class={`${bodyClass} mb-4`}>{t.description}</p>
    <Figure caption={t.caption}>
      <ul class='space-y-2'>
        {t.rows.map((row) => (
          <li
            key={row.interval}
            class='flex flex-col gap-2 rounded-xl bg-cream dark:bg-gray-800 p-3 sm:flex-row sm:items-start sm:gap-4'
          >
            <span class='shrink-0 self-start rounded-full bg-terracotta px-3 py-1 text-xs font-semibold text-white sm:w-28 sm:text-center'>
              {row.interval}
            </span>
            <ul class='list-disc space-y-1 pl-5 text-sm text-charcoal dark:text-gray-200'>
              {row.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </li>
        ))}
      </ul>
    </Figure>
    <Notes items={t.notes} />
  </section>
);

const CodeStructure = ({ t }: { t: (typeof content)[Lang]['code'] }) => (
  <section class={cardClass}>
    <h3 class={h3Class}>{t.title}</h3>
    <p class={`${bodyClass} mb-4`}>{t.description}</p>
    <div class='space-y-4'>
      <Figure caption={t.layersCaption}>
        <div class='mx-auto max-w-md'>
          <Node name={t.routes.name} description={t.routes.description} kind='service' />
          <VerticalArrow direction='down' />
          <Node name={t.useCase.name} description={t.useCase.description} kind='service' />
          <VerticalArrow direction='down' />
          <Node name={t.domain.name} description={t.domain.description} kind='worker' />
          <VerticalArrow direction='up' label={t.implementLabel} />
          <Node name={t.adaptor.name} description={t.adaptor.description} kind='service' />
        </div>
      </Figure>
      <Figure caption={t.writeCaption}>
        <div class='flex flex-col items-stretch gap-1 sm:flex-row sm:items-center'>
          <Node name={t.write.name} description={t.write.description} kind='service' class='sm:w-1/3' />
          <ul class='flex min-w-0 flex-1 flex-col gap-2'>
            {[t.tables, t.events].map((node) => (
              <li key={node.name} class='flex flex-col items-center gap-1 sm:flex-row'>
                <FlowArrow />
                <Node name={node.name} description={node.description} kind='service' class='w-full sm:flex-1' />
              </li>
            ))}
          </ul>
        </div>
      </Figure>
    </div>
    <Notes items={t.notes} />
  </section>
);

const Deploy = ({ t }: { t: (typeof content)[Lang]['deploy'] }) => (
  <section class={cardClass}>
    <h3 class={h3Class}>{t.title}</h3>
    <p class={`${bodyClass} mb-4`}>{t.description}</p>
    <Figure caption={t.caption}>
      <FlowList nodes={t.nodes} />
    </Figure>
    <Notes items={t.notes} />
  </section>
);

const Stack = ({ t }: { t: (typeof content)[Lang]['stack'] }) => (
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
      <div class='pt-6 px-2'>
        <h2 class='text-2xl font-bold text-charcoal dark:text-white mb-2'>{t.title}</h2>
        <p class={bodyClass}>{t.intro}</p>
      </div>
      <Overview t={t.overview} />
      <PageLoad t={t.page} />
      <Delivery t={t.delivery} />
      <Schedule t={t.schedule} />
      <CodeStructure t={t.code} />
      <Deploy t={t.deploy} />
      <Stack t={t.stack} />
    </section>
  );
};
