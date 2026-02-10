import { render } from 'hono/jsx/dom';

const content = {
  ja: {
    title: 'ioriについて',
    subtitle: '小さく、居心地の良い隠れ家。Fediverse上のあなたの居場所。',
    description:
      'ioriは、個人や小規模グループ向けの軽量でセルフホスト可能なマイクロブログプラットフォームです。ActivityPubによる連合機能を完全サポートしています。',
    featuresTitle: '主な機能',
    features: [
      {
        title: 'ActivityPub連合',
        description: 'Mastodon、Misskey、その他のFediverseプラットフォームと接続できます。',
      },
      {
        title: '個人・小規模グループ向け',
        description: '個人ブログや小規模コミュニティのために設計されています。',
      },
      {
        title: 'リモートフォロー',
        description: '他のサーバーのユーザーが簡単にフォローできます。',
      },
      {
        title: 'タイムライン',
        description: 'フォローしている人の投稿が表示されるホームタイムライン。',
      },
      {
        title: '通知',
        description: 'Web Push対応のフォロー通知機能。',
      },
      {
        title: 'Markdownサポート',
        description: 'リッチなフォーマットで投稿を作成できます。',
      },
      {
        title: '画像添付',
        description: '投稿に画像を共有できます。',
      },
      {
        title: 'ダークモード',
        description: 'システム設定に基づく自動ダーク/ライトテーマ。',
      },
    ],
    techStackTitle: '技術スタック',
    techStack: [
      { name: 'Runtime', value: 'Node.js' },
      { name: 'Framework', value: 'Hono - 高速で軽量なWebフレームワーク' },
      { name: 'Federation', value: 'Fedify - ActivityPubサーバーフレームワーク' },
      { name: 'Database', value: 'PostgreSQL with Drizzle ORM' },
      { name: 'Validation', value: 'Zod - スキーマ駆動バリデーション' },
      { name: 'Build', value: 'Vite' },
    ],
    sourceCodeTitle: 'ソースコード',
    sourceCodeDescription: 'ioriはオープンソースソフトウェア（MITライセンス）です。',
    viewOnGitHub: 'GitHubで見る',
  },
  en: {
    title: 'About iori',
    subtitle: 'A small, cozy retreat. Your personal space on the Fediverse.',
    description:
      'iori is a lightweight, self-hosted microblogging platform for individuals or small groups, with full ActivityPub federation support.',
    featuresTitle: 'Features',
    features: [
      {
        title: 'ActivityPub Federation',
        description: 'Connect with Mastodon, Misskey, and other Fediverse platforms.',
      },
      {
        title: 'Single/Small Group Focus',
        description: 'Designed for personal blogs or small communities.',
      },
      {
        title: 'Remote Follow',
        description: 'Allow users from other servers to follow you easily.',
      },
      {
        title: 'Timeline',
        description: 'Home timeline with posts from people you follow.',
      },
      {
        title: 'Notifications',
        description: 'Follow notifications with Web Push support.',
      },
      {
        title: 'Markdown Support',
        description: 'Write posts with rich formatting.',
      },
      {
        title: 'Image Attachments',
        description: 'Share images with your posts.',
      },
      {
        title: 'Dark Mode',
        description: 'Automatic dark/light theme based on system preference.',
      },
    ],
    techStackTitle: 'Tech Stack',
    techStack: [
      { name: 'Runtime', value: 'Node.js' },
      { name: 'Framework', value: 'Hono - Fast, lightweight web framework' },
      { name: 'Federation', value: 'Fedify - ActivityPub server framework' },
      { name: 'Database', value: 'PostgreSQL with Drizzle ORM' },
      { name: 'Validation', value: 'Zod - Schema-driven validation' },
      { name: 'Build', value: 'Vite' },
    ],
    sourceCodeTitle: 'Source Code',
    sourceCodeDescription: 'iori is open source software (MIT License).',
    viewOnGitHub: 'View on GitHub',
  },
} as const;

const detectLanguage = (): 'ja' | 'en' => {
  const lang = navigator.language;
  if (lang.startsWith('ja')) return 'ja';
  return 'en';
};

const AboutPage = () => {
  const lang = detectLanguage();
  const t = content[lang];

  return (
    <section class='space-y-6'>
      {/* Header */}
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover'>
        <div class='text-center'>
          <h1 class='text-3xl font-bold text-charcoal dark:text-white mb-3'>
            {t.title}
          </h1>
          <p class='text-lg text-charcoal-light dark:text-gray-300 italic mb-4'>
            {t.subtitle}
          </p>
          <p class='text-warm-gray-dark dark:text-gray-400 max-w-lg mx-auto'>
            {t.description}
          </p>
        </div>
      </div>

      {/* Features */}
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 blob-bg'>
        <h2 class='text-xl font-semibold text-charcoal dark:text-white mb-6 relative z-10'>
          {t.featuresTitle}
        </h2>
        <div class='grid gap-4 sm:grid-cols-2 relative z-10'>
          {t.features.map((feature, index) => (
            <div
              key={feature.title}
              class={`bg-sand-light/50 dark:bg-gray-700/50 p-4 shadow-clay-inset clay-hover-lift hover:bg-sand-light dark:hover:bg-gray-700 transition-all ${
                index % 3 === 0 ? 'blob' : index % 3 === 1 ? 'blob-2' : 'blob-3'
              }`}
            >
              <h3 class='font-medium text-charcoal dark:text-white mb-1'>
                {feature.title}
              </h3>
              <p class='text-sm text-charcoal-light dark:text-gray-400'>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8'>
        <h2 class='text-xl font-semibold text-charcoal dark:text-white mb-6'>
          {t.techStackTitle}
        </h2>
        <div class='space-y-3'>
          {t.techStack.map((tech) => (
            <div
              key={tech.name}
              class='flex items-start gap-3 bg-sand-light/50 dark:bg-gray-700/50 rounded-xl p-3 shadow-clay-inset'
            >
              <span class='font-medium text-charcoal dark:text-gray-300 min-w-24'>
                {tech.name}
              </span>
              <span class='text-charcoal-light dark:text-gray-400'>{tech.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Source Code */}
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8'>
        <h2 class='text-xl font-semibold text-charcoal dark:text-white mb-4'>
          {t.sourceCodeTitle}
        </h2>
        <p class='text-charcoal-light dark:text-gray-400 mb-4'>
          {t.sourceCodeDescription}
        </p>
        <a
          href='https://github.com/iwasa-kosui/monorepo/tree/main/apps/microblog'
          target='_blank'
          rel='noopener noreferrer'
          class='inline-flex items-center gap-2 px-5 py-2.5 bg-charcoal hover:bg-charcoal-light text-white font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          <svg class='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
            <path d='M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' />
          </svg>
          {t.viewOnGitHub}
        </a>
      </div>
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<AboutPage />, root);
}
