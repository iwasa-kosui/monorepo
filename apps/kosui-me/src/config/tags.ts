type TagDefinition = {
  color: string;
  category: string;
};

const tagDefinitions: Record<string, TagDefinition> = {
  // Languages / Runtimes
  TypeScript: { color: '#3178c6', category: 'Languages' },
  Go: { color: '#00ADD8', category: 'Languages' },
  'Node.js': { color: '#339933', category: 'Languages' },
  'fp-ts': { color: '#3178c6', category: 'Languages' },
  'Mermaid.js': { color: '#FF3670', category: 'Languages' },

  // Cloud / Infrastructure
  AWS: { color: '#FF9900', category: 'Cloud' },
  GCP: { color: '#4285F4', category: 'Cloud' },
  ECS: { color: '#FF9900', category: 'Cloud' },
  Fargate: { color: '#FF9900', category: 'Cloud' },
  FireLens: { color: '#FF9900', category: 'Cloud' },
  ISUCON: { color: '#e05e52', category: 'Cloud' },

  // Databases
  PostgreSQL: { color: '#336791', category: 'Databases' },
  DynamoDB: { color: '#4053D6', category: 'Databases' },
  BigQuery: { color: '#4285F4', category: 'Databases' },
  Database: { color: '#336791', category: 'Databases' },

  // Architecture / Design
  Architecture: { color: '#8b5cf6', category: 'Design' },
  Platform: { color: '#8b5cf6', category: 'Design' },
  SRE: { color: '#8b5cf6', category: 'Design' },
  'State Pattern': { color: '#8b5cf6', category: 'Design' },
  'ID設計': { color: '#8b5cf6', category: 'Design' },
  設計: { color: '#8b5cf6', category: 'Design' },
  設計パターン: { color: '#8b5cf6', category: 'Design' },
  アーキテクチャ: { color: '#8b5cf6', category: 'Design' },
  ドメインイベント: { color: '#8b5cf6', category: 'Design' },
  状態管理: { color: '#8b5cf6', category: 'Design' },

  // TypeScript Concepts
  型安全性: { color: '#3178c6', category: 'TypeScript Concepts' },
  型システム: { color: '#3178c6', category: 'TypeScript Concepts' },
  ユーティリティ型: { color: '#3178c6', category: 'TypeScript Concepts' },
  interface: { color: '#3178c6', category: 'TypeScript Concepts' },
  非同期: { color: '#3178c6', category: 'TypeScript Concepts' },
  ビジネスロジック: { color: '#3178c6', category: 'TypeScript Concepts' },

  // Security / Auth
  Authentication: { color: '#dc2626', category: 'Security' },
  OAuth: { color: '#dc2626', category: 'Security' },
  'OpenID Connect': { color: '#dc2626', category: 'Security' },
  Authlete: { color: '#dc2626', category: 'Security' },
  セキュリティ: { color: '#dc2626', category: 'Security' },
  データベース: { color: '#336791', category: 'Databases' },

  // Practices
  'Functional Programming': { color: '#059669', category: 'Practices' },
  Testing: { color: '#059669', category: 'Practices' },
  Backend: { color: '#059669', category: 'Practices' },
  Documentation: { color: '#059669', category: 'Practices' },
  'Team Practice': { color: '#059669', category: 'Practices' },
  'Software Engineering': { color: '#059669', category: 'Practices' },
  'Product Management': { color: '#059669', category: 'Practices' },
  パフォーマンス: { color: '#059669', category: 'Practices' },
  プロファイリング: { color: '#059669', category: 'Practices' },
  ドキュメント: { color: '#059669', category: 'Practices' },
  コミュニケーション: { color: '#059669', category: 'Practices' },
  要求分析: { color: '#059669', category: 'Practices' },
  'UI設計': { color: '#059669', category: 'Practices' },
  インフラ: { color: '#059669', category: 'Practices' },

  // Tools
  CLI: { color: '#64748b', category: 'Tools' },
  環境変数: { color: '#64748b', category: 'Tools' },
  コンパイラ: { color: '#64748b', category: 'Tools' },
  言語処理系: { color: '#64748b', category: 'Tools' },
  Compiler: { color: '#64748b', category: 'Tools' },
  UserScript: { color: '#64748b', category: 'Tools' },
  Browser: { color: '#64748b', category: 'Tools' },
  'User-Agent': { color: '#64748b', category: 'Tools' },
  Chrome: { color: '#64748b', category: 'Tools' },

  // Academic
  ゲーム理論: { color: '#9333ea', category: 'Academic' },
  交渉解: { color: '#9333ea', category: 'Academic' },
  経済学: { color: '#9333ea', category: 'Academic' },

  // Team
  Team: { color: '#059669', category: 'Practices' },
};

const fallback: TagDefinition = { color: '#6b7280', category: 'Other' };

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
