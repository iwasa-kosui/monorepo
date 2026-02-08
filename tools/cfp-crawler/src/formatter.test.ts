import { describe, expect, it } from 'vitest';

import { formatMarkdown } from './formatter.js';
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

describe('formatMarkdown', () => {
  it('should generate markdown with CFP section', () => {
    const entries = [
      makeCfpEntry({
        conferenceName: 'TSKaigi 2026',
        cfpUrl: 'https://example.com/cfp',
        cfpDeadline: new Date('2026-03-15'),
        conferenceDate: new Date('2026-05-10'),
        location: '東京',
        source: 'fortee',
      }),
    ];

    const result = formatMarkdown(entries);

    expect(result).toContain('# CFP情報一覧');
    expect(result).toContain('## CFP募集中');
    expect(result).toContain('TSKaigi 2026');
    expect(result).toContain('2026-03-15');
    expect(result).toContain('2026-05-10');
    expect(result).toContain('東京');
    expect(result).toContain('fortee');
  });

  it('should generate markdown with other conferences section', () => {
    const entries = [
      makeCfpEntry({
        conferenceName: 'CloudNative Days',
        conferenceDate: new Date('2026-06-01'),
        location: '名古屋',
        source: 'findy',
      }),
    ];

    const result = formatMarkdown(entries);

    expect(result).toContain('## その他のカンファレンス');
    expect(result).toContain('CloudNative Days');
    expect(result).toContain('2026-06-01');
    expect(result).toContain('名古屋');
  });

  it('should sort CFP entries by deadline', () => {
    const entries = [
      makeCfpEntry({
        conferenceName: 'Later CFP',
        cfpUrl: 'https://example.com/cfp2',
        cfpDeadline: new Date('2026-05-01'),
      }),
      makeCfpEntry({
        conferenceName: 'Earlier CFP',
        cfpUrl: 'https://example.com/cfp1',
        cfpDeadline: new Date('2026-03-01'),
      }),
    ];

    const result = formatMarkdown(entries);
    const laterIndex = result.indexOf('Later CFP');
    const earlierIndex = result.indexOf('Earlier CFP');

    expect(earlierIndex).toBeLessThan(laterIndex);
  });

  it('should handle empty entries', () => {
    const result = formatMarkdown([]);

    expect(result).toContain('# CFP情報一覧');
    expect(result).toContain('該当するカンファレンス情報はありませんでした。');
  });

  it('should escape markdown special characters in conference names', () => {
    const entries = [
      makeCfpEntry({
        conferenceName: 'Test [Special] | Conference',
      }),
    ];

    const result = formatMarkdown(entries);

    expect(result).toContain('Test \\[Special\\] \\| Conference');
  });
});
