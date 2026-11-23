import { useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

const USERNAME = 'kosui';

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
    label: 'iori 庵',
    title: 'blog.kosui.me について',
    lead:
      'ここは kosui が個人で運営している小さなサーバーです。日々のメモと記事をここに書き、Fediverse と Bluesky に届けています。サーバーは、自作のソフトウェア「iori」で動いています。',
    follow: {
      title: 'フォローする',
      description:
        'Mastodon や Misskey など、ActivityPub に対応したサービスのアカウントからフォローできます。アカウントがなくても、投稿と記事はこのサイトで読めます。',
      copy: 'コピー',
      copied: 'コピーしました',
      note: '新しいアカウントの登録は受け付けていません。',
      followLink: 'フォローする',
      postsLink: '投稿を読む',
      articlesLink: '記事を読む',
    },
    about: {
      title: 'iori とは',
      quote: '静かに思索し、知を紡ぎ、世界と繋がる小さな隠れ家',
      description:
        'iori（庵）は、Fediverse につながる個人向けのナレッジ管理ソフトウェアです。私は次の4つを実現するために iori を作っています。',
      goals: [
        '大規模なプラットフォームに依存せず、自分の知識の置き場所を持つ',
        '思いついたことを流さず、蓄積して整理する',
        'Fediverse から他の人の知識を集め、自分の知識と合わせる',
        '蓄積した知識を、必要なときに発信する',
      ],
      unitsTitle: '書いたものの3つの単位',
      units: [
        { name: 'ノート', description: '日々の思考を記録する短いテキスト' },
        { name: 'スレッド', description: 'ノートへの返信の連なり。思考を展開する場所' },
        { name: '記事', description: 'スレッドをまとめた長い文章' },
      ],
    },
    features: {
      title: 'できること',
      groups: [
        {
          title: '書く',
          items: [
            'Markdown で書くノート。画像の添付、公開範囲の指定、投票、引用に対応',
            'ノートに返信を重ねるスレッド',
            '長い文章をまとめる記事',
          ],
        },
        {
          title: 'つながる',
          items: [
            'ActivityPub による連合。フォロー、いいね、リポスト、絵文字リアクション',
            'Bluesky への同時投稿と、Bluesky のタイムラインの取り込み',
            'Mastodon 互換 API。Mastodon 用のクライアントアプリから利用可能',
          ],
        },
        {
          title: '読む',
          items: [
            'ホームタイムラインと連合タイムライン',
            '検索とブックマーク',
            'Web Push に対応した通知',
          ],
        },
        {
          title: 'AI',
          items: [
            'タイムラインの要約と投稿の翻訳',
            'RSS などから集めた記事の日次ダイジェスト',
            'メンションに答える bot。発言はすべて AI が自動で生成',
          ],
        },
      ],
    },
    stack: {
      title: '構成',
      items: stack,
    },
    source: {
      title: 'ソースコード',
      description: 'iori のソースコードは GitHub で公開しています。',
      button: 'GitHubで見る',
    },
  },
  en: {
    label: 'iori 庵',
    title: 'About blog.kosui.me',
    lead:
      'This is a small server run by kosui. I write my daily notes and articles here and deliver them to the Fediverse and Bluesky. The server runs on iori, software I build myself.',
    follow: {
      title: 'Follow',
      description:
        'You can follow from any ActivityPub-compatible service such as Mastodon or Misskey. Without an account, you can still read the posts and articles on this site.',
      copy: 'Copy',
      copied: 'Copied',
      note: 'New account registration is closed.',
      followLink: 'Follow',
      postsLink: 'Read posts',
      articlesLink: 'Read articles',
    },
    about: {
      title: 'What is iori',
      quote: 'A small hermitage for quiet contemplation, weaving knowledge, and connecting with the world',
      description:
        'iori (庵) is personal knowledge management software connected to the Fediverse. I build iori to do four things.',
      goals: [
        'Own a place for my knowledge without depending on large platforms',
        'Accumulate and organize thoughts instead of letting them slip away',
        'Collect knowledge from others via the Fediverse and combine it with my own',
        'Share accumulated knowledge when needed',
      ],
      unitsTitle: 'Three units of writing',
      units: [
        { name: 'Note', description: 'Short text for recording daily thoughts' },
        { name: 'Thread', description: 'A chain of replies to a note, where a thought develops' },
        { name: 'Article', description: 'A longer piece compiled from threads' },
      ],
    },
    features: {
      title: 'Features',
      groups: [
        {
          title: 'Write',
          items: [
            'Notes in Markdown, with images, visibility settings, polls, and quotes',
            'Threads that build on a note with replies',
            'Articles for longer writing',
          ],
        },
        {
          title: 'Connect',
          items: [
            'Federation over ActivityPub: follows, likes, reposts, and emoji reactions',
            'Cross-posting to Bluesky and importing the Bluesky timeline',
            'Mastodon-compatible API, usable from Mastodon client apps',
          ],
        },
        {
          title: 'Read',
          items: [
            'Home timeline and federated timeline',
            'Search and bookmarks',
            'Notifications with Web Push',
          ],
        },
        {
          title: 'AI',
          items: [
            'Timeline summaries and post translation',
            'Daily digest of articles collected from RSS and other sources',
            'A bot that answers mentions. Everything it says is generated by AI',
          ],
        },
      ],
    },
    stack: {
      title: 'Stack',
      items: stack,
    },
    source: {
      title: 'Source Code',
      description: 'The source code of iori is available on GitHub.',
      button: 'View on GitHub',
    },
  },
} as const;

const detectLanguage = (): 'ja' | 'en' => {
  const lang = navigator.language;
  if (lang.startsWith('ja')) return 'ja';
  return 'en';
};

const cardClass = 'bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 sm:p-8';
const insetClass = 'bg-sand-light/50 dark:bg-gray-700/50 rounded-xl shadow-clay-inset';
const primaryButtonClass =
  'px-5 py-2.5 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all text-center active:scale-[0.98] active:translate-y-px';
const secondaryButtonClass =
  'px-5 py-2.5 border border-warm-gray-dark dark:border-gray-600 text-charcoal dark:text-gray-200 hover:bg-sand-light/50 dark:hover:bg-gray-700/50 font-medium rounded-clay transition-all text-center active:scale-[0.98] active:translate-y-px';
const h2Class = 'text-xl font-semibold text-charcoal dark:text-white mb-4';
const h3Class = 'font-medium text-charcoal dark:text-white mb-2';
const bodyClass = 'text-charcoal-light dark:text-gray-400';
const listClass = 'list-disc pl-5 space-y-1 text-charcoal-light dark:text-gray-400';

const AboutPage = () => {
  const lang = detectLanguage();
  const t = content[lang];
  document.documentElement.lang = lang;

  const handle = `@${USERNAME}@${window.location.host}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(handle);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class='space-y-6'>
      <header class='px-2 py-6 sm:py-10'>
        <p class='text-sm font-medium tracking-widest text-terracotta dark:text-terracotta-light mb-3'>
          {t.label}
        </p>
        <h1 class='text-3xl sm:text-4xl font-bold text-charcoal dark:text-white mb-6'>
          {t.title}
        </h1>
        <p class='text-lg leading-relaxed text-charcoal-light dark:text-gray-300 max-w-2xl'>
          {t.lead}
        </p>
      </header>

      <section class={cardClass}>
        <h2 class={h2Class}>{t.follow.title}</h2>
        <p class={`${bodyClass} mb-4`}>{t.follow.description}</p>
        <div class={`flex items-center justify-between gap-3 ${insetClass} p-3 mb-2`}>
          <code class='font-mono text-charcoal dark:text-white break-all'>{handle}</code>
          <button
            type='button'
            onClick={handleCopy}
            class='shrink-0 px-3 py-1.5 text-sm border border-warm-gray-dark dark:border-gray-600 text-charcoal dark:text-gray-200 hover:bg-sand-light/50 dark:hover:bg-gray-700/50 rounded-clay transition-all active:scale-[0.98]'
          >
            {copied ? t.follow.copied : t.follow.copy}
          </button>
        </div>
        <p class='text-xs text-charcoal-light dark:text-gray-400 mb-5'>{t.follow.note}</p>
        <div class='flex flex-wrap gap-3'>
          <a href='/follow' class={primaryButtonClass}>{t.follow.followLink}</a>
          <a href={`/users/${USERNAME}`} class={secondaryButtonClass}>{t.follow.postsLink}</a>
          <a href='/articles' class={secondaryButtonClass}>{t.follow.articlesLink}</a>
        </div>
      </section>

      <section class={cardClass}>
        <h2 class={h2Class}>{t.about.title}</h2>
        <blockquote class='border-l-4 border-terracotta pl-4 my-6 text-xl font-medium text-charcoal dark:text-white'>
          {t.about.quote}
        </blockquote>
        <p class={`${bodyClass} mb-3`}>{t.about.description}</p>
        <ul class={`${listClass} mb-8`}>
          {t.about.goals.map((goal) => <li key={goal}>{goal}</li>)}
        </ul>
        <h3 class={h3Class}>{t.about.unitsTitle}</h3>
        <div class='grid gap-3 sm:grid-cols-3'>
          {t.about.units.map((unit) => (
            <div key={unit.name} class={`${insetClass} p-4`}>
              <h3 class='font-medium text-charcoal dark:text-white mb-1'>{unit.name}</h3>
              <p class='text-sm text-charcoal-light dark:text-gray-400'>{unit.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section class={cardClass}>
        <h2 class={h2Class}>{t.features.title}</h2>
        <div class='grid gap-6 sm:grid-cols-2'>
          {t.features.groups.map((group) => (
            <div key={group.title}>
              <h3 class={h3Class}>{group.title}</h3>
              <ul class={listClass}>
                {group.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section class={cardClass}>
        <h2 class={h2Class}>{t.stack.title}</h2>
        <dl class='grid gap-3 sm:grid-cols-2'>
          {t.stack.items.map((item) => (
            <div key={item.name} class={`${insetClass} p-3`}>
              <dt class='text-sm text-charcoal-light dark:text-gray-400'>{item.name}</dt>
              <dd class='font-medium text-charcoal dark:text-white'>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section class={cardClass}>
        <h2 class={h2Class}>{t.source.title}</h2>
        <p class={`${bodyClass} mb-4`}>{t.source.description}</p>
        <a
          href='https://github.com/iwasa-kosui/monorepo/tree/main/apps/iori'
          target='_blank'
          rel='noopener noreferrer'
          class='inline-flex items-center gap-2 px-5 py-2.5 bg-charcoal hover:bg-charcoal-light text-white font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          <svg class='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
            <path d='M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' />
          </svg>
          {t.source.button}
        </a>
      </section>
    </div>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<AboutPage />, root);
}
