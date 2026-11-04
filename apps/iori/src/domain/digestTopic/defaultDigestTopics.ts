export type DefaultDigestTopic = Readonly<{ topicKey: string; name: string; description: string }>;

export const defaultDigestTopics: ReadonlyArray<DefaultDigestTopic> = [
  {
    topicKey: 'genai',
    name: '生成 AI とエージェント',
    description: 'LLM、AI エージェント、AI を使った開発と評価',
  },
  {
    topicKey: 'platform',
    name: 'プラットフォームエンジニアリングとインフラ',
    description: '開発者向けの基盤、CI/CD、Kubernetes、AWS や Cloudflare などのクラウド、運用と可観測性',
  },
  {
    topicKey: 'server',
    name: 'サーバアプリケーション開発',
    description: 'バックエンドの実装、API、データベース、性能、言語とランタイム',
  },
  {
    topicKey: 'design',
    name: '設計と開発プロセス',
    description: 'ソフトウェア設計、ドメイン駆動設計、テスト、コードレビュー、チーム開発',
  },
  {
    topicKey: 'ciam',
    name: '認証と ID 管理（CIAM）',
    description: '顧客向けの ID とアクセス管理、OAuth と OpenID Connect、パスキー、認可',
  },
  {
    topicKey: 'security',
    name: 'セキュリティ',
    description: '脆弱性、攻撃と対策の事例、サプライチェーン',
  },
  {
    topicKey: 'fediverse',
    name: '分散 SNS と Web の標準',
    description: 'ActivityPub、Mastodon、Fediverse、HTTP などの仕様',
  },
];
