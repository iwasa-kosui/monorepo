import { describe, expect, it } from 'vitest';

import { filterByInterest } from './filter.js';
import { CfpEntry } from './types.js';

const makeCfpEntry = (overrides: Partial<CfpEntry> = {}): CfpEntry => ({
  conferenceName: 'Test Conference',
  cfpUrl: null,
  conferenceUrl: 'https://example.com',
  cfpDeadline: null,
  conferenceDate: null,
  location: null,
  source: 'fortee',
  ...overrides,
});

describe('filterByInterest', () => {
  it('should match entries with interest keywords', () => {
    const entries = [
      makeCfpEntry({ conferenceName: 'TSKaigi 2026' }),
      makeCfpEntry({ conferenceName: 'Unrelated Event' }),
    ];

    const result = filterByInterest(entries);

    expect(result).toHaveLength(1);
    expect(result[0].conferenceName).toBe('TSKaigi 2026');
    expect(result[0].matchedKeywords).toContain('ts');
    expect(result[0].matchedKeywords).toContain('kaigi');
  });

  it('should match case-insensitively', () => {
    const entries = [
      makeCfpEntry({ conferenceName: 'TypeScript Conference' }),
    ];

    const result = filterByInterest(entries);

    expect(result).toHaveLength(1);
    expect(result[0].matchedKeywords).toContain('typescript');
    expect(result[0].matchedKeywords).toContain('conference');
  });

  it('should match Japanese keywords', () => {
    const entries = [
      makeCfpEntry({ conferenceName: 'フロントエンド技術勉強会' }),
      makeCfpEntry({ conferenceName: 'セキュリティカンファレンス' }),
    ];

    const result = filterByInterest(entries);

    expect(result).toHaveLength(2);
    expect(result[0].matchedKeywords).toContain('フロントエンド');
    expect(result[1].matchedKeywords).toContain('セキュリティ');
  });

  it('should return empty array when no entries match', () => {
    const entries = [
      makeCfpEntry({ conferenceName: 'Cooking Workshop' }),
    ];

    const result = filterByInterest(entries);

    expect(result).toHaveLength(0);
  });

  it('should handle empty input', () => {
    const result = filterByInterest([]);

    expect(result).toHaveLength(0);
  });
});
