type Theme = Readonly<{
  slug: string;
  name: string;
  color: string;
  description: string;
}>;

const themes: readonly Theme[] = [
  {
    slug: 'typescript',
    name: 'TypeScript',
    color: '#3178c6',
    description: '型システム・Discriminated Union・ドメインモデリング',
  },
  {
    slug: 'architecture',
    name: 'アーキテクチャ',
    color: '#8b5cf6',
    description: '設計パターン・サービス分割・ID設計',
  },
  {
    slug: 'sre',
    name: 'SRE・運用',
    color: '#f59e0b',
    description: 'パフォーマンス・可観測性・インシデント対応',
  },
  {
    slug: 'team',
    name: 'チーム開発',
    color: '#10b981',
    description: 'プラクティス・プロセス改善・コードレビュー',
  },
] as const;

export type ThemeSlug = (typeof themes)[number]['slug'];

export function getTheme(slug: string): Theme | undefined {
  return themes.find((t) => t.slug === slug);
}

export function getAllThemes(): readonly Theme[] {
  return themes;
}
