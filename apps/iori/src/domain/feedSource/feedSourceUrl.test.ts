import { describe, expect, it } from 'vitest';

import { blockedReason } from './feedSourceUrl.ts';

describe('blockedReason', () => {
  it.each([
    ['https://example.com/feed', undefined],
    ['https://blog.example.com:8443/feed', undefined],
    ['https://localhostfoo.example.com/feed', undefined],
    ['http://example.com/feed', 'only https is allowed'],
    ['ftp://example.com/feed', 'only https is allowed'],
    ['https://127.0.0.1/feed', 'IP address hosts are not allowed'],
    ['https://2130706433/feed', 'IP address hosts are not allowed'],
    ['https://[::1]/feed', 'IP address hosts are not allowed'],
    ['https://localhost/feed', 'local hosts are not allowed'],
    ['https://LOCALHOST./feed', 'local hosts are not allowed'],
    ['https://app.localhost/feed', 'local hosts are not allowed'],
    ['https://printer.local./feed', 'local hosts are not allowed'],
    ['https://db.internal/feed', 'local hosts are not allowed'],
  ])('%s の拒否理由は %s', (url, reason) => {
    expect(blockedReason(new URL(url))).toBe(reason);
  });
});
