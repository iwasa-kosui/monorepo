type TagDefinition = {
  color: string;
  category: string;
};

const tagDefinitions: Record<string, TagDefinition> = {
  // 言語 / ランタイム
  TypeScript: { color: '#3178c6', category: '言語' },
  Go: { color: '#00ADD8', category: '言語' },
  'Node.js': { color: '#339933', category: '言語' },
  'fp-ts': { color: '#3178c6', category: '言語' },
  'Mermaid.js': { color: '#FF3670', category: '言語' },

  // クラウド / インフラ
  AWS: { color: '#FF9900', category: 'クラウド' },
  GCP: { color: '#4285F4', category: 'クラウド' },
  ECS: { color: '#FF9900', category: 'クラウド' },
  Fargate: { color: '#FF9900', category: 'クラウド' },
  FireLens: { color: '#FF9900', category: 'クラウド' },
  ISUCON: { color: '#e05e52', category: 'クラウド' },
  インフラ: { color: '#FF9900', category: 'クラウド' },

  // データベース
  PostgreSQL: { color: '#336791', category: 'データベース' },
  DynamoDB: { color: '#4053D6', category: 'データベース' },
  BigQuery: { color: '#4285F4', category: 'データベース' },
  データベース: { color: '#336791', category: 'データベース' },

  // 設計 / アーキテクチャ
  アーキテクチャ: { color: '#8b5cf6', category: '設計' },
  プラットフォーム: { color: '#8b5cf6', category: '設計' },
  SRE: { color: '#8b5cf6', category: '設計' },
  'Stateパターン': { color: '#8b5cf6', category: '設計' },
  'ID設計': { color: '#8b5cf6', category: '設計' },
  設計: { color: '#8b5cf6', category: '設計' },
  設計パターン: { color: '#8b5cf6', category: '設計' },
  ドメインイベント: { color: '#8b5cf6', category: '設計' },
  状態管理: { color: '#8b5cf6', category: '設計' },

  // TypeScript コンセプト
  型安全性: { color: '#3178c6', category: 'TypeScript' },
  型システム: { color: '#3178c6', category: 'TypeScript' },
  ユーティリティ: { color: '#3178c6', category: 'TypeScript' },
  ユーティリティ型: { color: '#3178c6', category: 'TypeScript' },
  interface: { color: '#3178c6', category: 'TypeScript' },
  非同期: { color: '#3178c6', category: 'TypeScript' },
  ビジネスロジック: { color: '#3178c6', category: 'TypeScript' },

  // セキュリティ / 認証
  認証: { color: '#dc2626', category: 'セキュリティ' },
  OAuth: { color: '#dc2626', category: 'セキュリティ' },
  'OpenID Connect': { color: '#dc2626', category: 'セキュリティ' },
  Authlete: { color: '#dc2626', category: 'セキュリティ' },
  セキュリティ: { color: '#dc2626', category: 'セキュリティ' },

  // プラクティス
  関数型プログラミング: { color: '#059669', category: 'プラクティス' },
  テスト: { color: '#059669', category: 'プラクティス' },
  バックエンド: { color: '#059669', category: 'プラクティス' },
  ドキュメント: { color: '#059669', category: 'プラクティス' },
  チームプラクティス: { color: '#059669', category: 'プラクティス' },
  ソフトウェアエンジニアリング: { color: '#059669', category: 'プラクティス' },
  プロダクトマネジメント: { color: '#059669', category: 'プラクティス' },
  パフォーマンス: { color: '#059669', category: 'プラクティス' },
  プロファイリング: { color: '#059669', category: 'プラクティス' },
  コミュニケーション: { color: '#059669', category: 'プラクティス' },
  要求分析: { color: '#059669', category: 'プラクティス' },
  'UI設計': { color: '#059669', category: 'プラクティス' },
  チーム: { color: '#059669', category: 'プラクティス' },

  // ツール
  CLI: { color: '#64748b', category: 'ツール' },
  環境変数: { color: '#64748b', category: 'ツール' },
  コンパイラ: { color: '#64748b', category: 'ツール' },
  言語処理系: { color: '#64748b', category: 'ツール' },
  UserScript: { color: '#64748b', category: 'ツール' },
  ブラウザ: { color: '#64748b', category: 'ツール' },
  'User-Agent': { color: '#64748b', category: 'ツール' },
  Chrome: { color: '#64748b', category: 'ツール' },

  // 学術
  ゲーム理論: { color: '#9333ea', category: '学術' },
  交渉解: { color: '#9333ea', category: '学術' },
  経済学: { color: '#9333ea', category: '学術' },
};

const fallback: TagDefinition = { color: '#6b7280', category: 'その他' };

export function getTagDefinition(tag: string): TagDefinition {
  return tagDefinitions[tag] ?? fallback;
}

export function getAllCategories(): string[] {
  const categories = new Set(
    Object.values(tagDefinitions).map((d) => d.category),
  );
  return [...categories];
}

export { tagDefinitions };
