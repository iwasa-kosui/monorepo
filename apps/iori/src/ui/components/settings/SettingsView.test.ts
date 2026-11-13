import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { CredentialAccount } from '../../../adaptor/mastodon/entities.ts';
import { BlueskySettingsView } from './BlueskySettingsSection.tsx';
import { PostingSettingsView } from './PostingSettingsSection.tsx';
import { ProfileSettingsForm } from './ProfileSettingsSection.tsx';
import { RelaysSettingsView } from './RelaysSettingsSection.tsx';
import { SettingsView } from './SettingsView.tsx';

const render = (isOwner: boolean): string => String(jsx(SettingsView, { isOwner }));

describe('SettingsView', () => {
  it('shows the heading and every section anchor in order', () => {
    const html = render(true);

    expect(html).toContain('<h1 class="text-2xl font-bold text-charcoal dark:text-white mb-6">設定</h1>');
    const positions = ['profile', 'notifications', 'posting', 'bluesky', 'relays', 'x-feed-sources'].map((id) =>
      html.indexOf(`id="${id}"`)
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('shows the Bluesky credential section to the owner only', () => {
    expect(render(true)).toContain('読み込んでいます');
    expect(render(false)).not.toContain('読み込んでいます');
  });

  it('never tells anyone to replace secrets or deploy for Bluesky', () => {
    for (const isOwner of [true, false]) {
      const html = render(isOwner);
      expect(html).not.toContain('BLUESKY_IDENTIFIER');
      expect(html).not.toContain('BLUESKY_APP_PASSWORD');
      expect(html).not.toContain('デプロイ');
    }
  });

  it('shows the security section with a link to manage passkeys after the relays', () => {
    const html = render(true);

    expect(html).toContain('id="security"');
    expect(html).toContain('セキュリティ');
    expect(html).toMatch(/<a href="\/settings\/passkeys"[^>]*>\s*パスキーを管理する\s*<\/a>/);
    expect(html.indexOf('id="security"')).toBeGreaterThan(html.indexOf('id="relays"'));
  });

  it('shows the relays section to the owner only', () => {
    expect(render(true)).toContain('id="relays"');
    expect(render(false)).not.toContain('id="relays"');
  });

  it('shows the posting section and the sign-out button whether or not the user is the owner', () => {
    for (const isOwner of [true, false]) {
      const html = render(isOwner);

      expect(html).toContain('id="posting"');
      expect(html).toContain('>投稿</h2>');
      expect(html).toMatch(
        /<form method="post" action="\/auth\/sign-out">\s*<button type="submit"[^>]*>\s*ログアウト\s*<\/button>/,
      );
    }
  });

  it('hides the X section from anyone but the owner', () => {
    expect(render(false)).not.toContain('id="x-feed-sources"');
    expect(render(false)).not.toContain('X の取り込み元');
  });
});

describe('PostingSettingsView', () => {
  const render = (props: Partial<Parameters<typeof PostingSettingsView>[0]> = {}): string =>
    String(jsx(PostingSettingsView, {
      visibility: 'public',
      loadFailed: false,
      isSaving: false,
      savedMessage: undefined,
      errorText: undefined,
      onChange: () => {},
      onSave: () => {},
      ...props,
    }));

  it('offers the three visibilities and checks the current one', () => {
    const html = render({ visibility: 'unlisted' });

    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/<input[^>]*name="defaultPostVisibility"[^>]*value="unlisted"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*name="defaultPostVisibility"[^>]*value="public"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*name="defaultPostVisibility"[^>]*value="private"[^>]*checked/);
  });

  it('tells that posts other than public are not sent to Bluesky', () => {
    expect(render()).toContain('公開以外を選んだ投稿は Bluesky に送られません。');
  });

  it('shows the save button, then the saving label while saving', () => {
    expect(render()).toMatch(/<button type="button"[^>]*>保存<\/button>/);
    expect(render({ isSaving: true })).toMatch(/<button type="button" disabled[^>]*>保存中...<\/button>/);
  });

  it('shows the saved message, the error and the load failure', () => {
    expect(render({ savedMessage: '保存しました' })).toContain('保存しました');
    expect(render({ errorText: '保存できません' })).toContain('保存できません');
    expect(render({ loadFailed: true })).toContain('設定を読み込めませんでした');
    expect(render()).not.toContain('設定を読み込めませんでした');
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
  const render = (isOwner: boolean): string =>
    String(jsx(BlueskySettingsView, { status: { enabled: false }, loadFailed: false, isOwner }));

  it('shows the credential section instead of the connection label to the owner', () => {
    const html = render(true);

    expect(html).toContain('id="bluesky"');
    expect(html).toContain('読み込んでいます');
    expect(html).not.toContain('Bluesky とは連携していません');
  });

  it('does not show the secret guidance to the owner', () => {
    const html = render(true);

    expect(html).not.toContain('secret');
    expect(html).not.toContain('デプロイ');
  });

  it('shows only the connection label to anyone but the owner', () => {
    const html = render(false);

    expect(html).toContain('Bluesky とは連携していません');
    expect(html).not.toContain('読み込んでいます');
    expect(html).not.toContain('secret');
  });
});

describe('RelaysSettingsView', () => {
  const render = (relays: Parameters<typeof RelaysSettingsView>[0]['relays'], loadFailed = false): string =>
    String(jsx(RelaysSettingsView, {
      relays,
      loadFailed,
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

  it('says the relays could not be loaded instead of saying there are none', () => {
    const html = render(undefined, true);

    expect(html).toContain('リレーを読み込めませんでした');
    expect(html).not.toContain('接続しているリレーはありません');
    expect(html).toContain('type="url"');
  });

  it('shows the loading text while the relays are loading', () => {
    expect(render(undefined)).toContain('読み込み中...');
  });
});
