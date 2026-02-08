import { CfpEntry } from './types.js';

const INTEREST_KEYWORDS = [
  // TypeScript / JavaScript
  'typescript',
  'ts',
  'javascript',
  'js',
  'node',
  'フロントエンド',
  'frontend',
  // 関数型プログラミング
  '関数型',
  'functional',
  'fp',
  // SRE / DevOps
  'sre',
  'reliability',
  'devops',
  'platform',
  'cloudnative',
  'cloud native',
  // 認証 / セキュリティ
  'oauth',
  'oidc',
  'auth',
  'security',
  'セキュリティ',
  '認証',
  // アーキテクチャ
  'architecture',
  'アーキテクチャ',
  'ddd',
  'domain',
  // ヘルスケア
  'healthcare',
  'ヘルスケア',
  '医療',
  // 汎用
  'kaigi',
  'conference',
  'conf',
] as const;

export type FilteredCfpEntry = CfpEntry & {
  readonly matchedKeywords: readonly string[];
};

export const filterByInterest = (
  entries: readonly CfpEntry[],
): readonly FilteredCfpEntry[] => {
  return entries
    .map((entry) => {
      const matchedKeywords = findMatchingKeywords(entry.conferenceName);
      return { ...entry, matchedKeywords };
    })
    .filter((entry) => entry.matchedKeywords.length > 0);
};

const findMatchingKeywords = (name: string): readonly string[] => {
  const lowerName = name.toLowerCase();
  return INTEREST_KEYWORDS.filter((keyword) => lowerName.includes(keyword.toLowerCase()));
};
