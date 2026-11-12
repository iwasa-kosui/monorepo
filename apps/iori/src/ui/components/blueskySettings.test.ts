import { describe, expect, it } from 'vitest';

import type { BlueskyStatus } from '../api/mastodonClient.ts';
import { blueskyConnectionLabel } from './blueskySettings.ts';

const scope = { state: 'ok', lastSucceededAt: null, lastFailedAt: null, failureKind: null, failureCode: null } as const;
const enabled: BlueskyStatus = { enabled: true, timeline: scope, notifications: scope, login: { state: 'ok' } };

describe('blueskyConnectionLabel', () => {
  it('shows loading until the status arrives', () => {
    expect(blueskyConnectionLabel({ status: undefined, loadFailed: false })).toBe('読み込み中...');
  });

  it('says the status could not be loaded when the request failed', () => {
    expect(blueskyConnectionLabel({ status: undefined, loadFailed: true })).toBe(
      'Bluesky の状態を読み込めませんでした',
    );
  });

  it('says whether Bluesky is connected', () => {
    expect(blueskyConnectionLabel({ status: enabled, loadFailed: false })).toBe('Bluesky と連携しています');
    expect(blueskyConnectionLabel({ status: { enabled: false }, loadFailed: false })).toBe(
      'Bluesky とは連携していません',
    );
  });
});
