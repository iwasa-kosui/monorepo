import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { CredentialAccount } from '../../../adaptor/mastodon/entities.ts';
import { BlueskySettingsView } from './BlueskySettingsSection.tsx';
import { ProfileSettingsForm } from './ProfileSettingsSection.tsx';
import { RelaysSettingsView } from './RelaysSettingsSection.tsx';
import { SettingsView } from './SettingsView.tsx';

const render = (isXOwner: boolean): string => String(jsx(SettingsView, { isXOwner }));

describe('SettingsView', () => {
  it('shows the heading and every section anchor in order', () => {
    const html = render(true);

    expect(html).toContain('<h1 class="text-2xl font-bold text-charcoal dark:text-white mb-6">設定</h1>');
    const positions = ['profile', 'notifications', 'bluesky', 'relays', 'x-feed-sources'].map((id) =>
      html.indexOf(`id="${id}"`)
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('hides the X section from anyone but the owner', () => {
    expect(render(false)).not.toContain('id="x-feed-sources"');
    expect(render(false)).not.toContain('X の取り込み元');
  });
});

describe('ProfileSettingsForm', () => {
  const me = { display_name: '岩佐', source: { note: '自己紹介' } } as CredentialAccount;
  const render = (props: Partial<Parameters<typeof ProfileSettingsForm>[0]> = {}): string =>
    String(jsx(ProfileSettingsForm, {
      me,
      loadFailed: false,
      isSubmitting: false,
      errorText: undefined,
      savedMessage: undefined,
      formKey: 0,
      onSubmit: () => {},
      ...props,
    }));

  it('puts the current profile into the form inside the page', () => {
    const html = render();

    expect(html).toContain('id="profile"');
    expect(html).toMatch(/<input[^>]*name="display_name"[^>]*value="岩佐"/);
    expect(html).toMatch(/<textarea[^>]*name="note"[^>]*value="自己紹介"/);
    expect(html).not.toContain('update-bio');
  });

  it('shows the saved message and the error', () => {
    expect(render({ savedMessage: 'プロフィールを保存しました' })).toContain('プロフィールを保存しました');
    expect(render({ errorText: '保存できません' })).toContain('保存できません');
  });

  it('shows a loading or failure text until the profile arrives', () => {
    expect(render({ me: undefined })).toContain('読み込み中...');
    expect(render({ me: undefined, loadFailed: true })).toContain('プロフィールを読み込めませんでした');
  });
});

describe('BlueskySettingsView', () => {
  it('tells that changing the account needs the secrets and a deploy', () => {
    const html = String(jsx(BlueskySettingsView, { status: { enabled: false }, loadFailed: false }));

    expect(html).toContain('id="bluesky"');
    expect(html).toContain('Bluesky とは連携していません');
    expect(html).toContain('BLUESKY_APP_PASSWORD の secret を差し替えて、デプロイしてください');
  });
});

describe('RelaysSettingsView', () => {
  const render = (relays: Parameters<typeof RelaysSettingsView>[0]['relays']): string =>
    String(jsx(RelaysSettingsView, {
      relays,
      relayUri: '',
      isSubscribing: false,
      errorText: '',
      isRequested: false,
      onUriInput: () => {},
      onSubmit: () => {},
    }));

  it('lists the relays with their hosts and states', () => {
    const html = render([
      { relayId: 'r1', actorUri: 'https://relay.example/actor', status: 'accepted' },
      { relayId: 'r2', actorUri: 'https://other.example/actor', status: 'pending' },
    ]);

    expect(html).toContain('id="relays"');
    expect(html).toContain('relay.example');
    expect(html).toContain('接続済み');
    expect(html).toContain('承認待ち');
  });

  it('says there are no relays and still shows the add form', () => {
    const html = render([]);

    expect(html).toContain('接続しているリレーはありません');
    expect(html).toContain('type="url"');
  });
});
