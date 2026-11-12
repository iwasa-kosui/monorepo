import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { toProfileUpdate } from './profileUpdate.ts';
import { UpdateProfileModal } from './UpdateProfileModal.tsx';

const render = (props: Partial<Parameters<typeof UpdateProfileModal>[0]> = {}): string =>
  String(jsx(UpdateProfileModal, {
    displayName: '岩佐',
    note: '自己紹介',
    isSubmitting: false,
    errorText: undefined,
    onSubmit: () => {},
    ...props,
  }));

describe('UpdateProfileModal', () => {
  it('表示名と自己紹介の入力欄に、いまの値を初期値として入れる', () => {
    const html = render();

    expect(html).toMatch(/<input[^>]*name="display_name"[^>]*value="岩佐"/);
    expect(html).toMatch(/<textarea[^>]*name="note"[^>]*value="自己紹介"/);
    expect(html).toContain('name="avatar"');
  });

  it('保存に失敗したら、エラーをモーダルに出す', () => {
    const html = render({ errorText: 'Validation failed: Display name is too long (maximum is 30 characters)' });

    expect(html).toContain('Validation failed: Display name is too long (maximum is 30 characters)');
  });

  it('保存中は更新ボタンを押せなくする', () => {
    expect(render({ isSubmitting: true })).toMatch(/<button[^>]*disabled[^>]*>Updating\.\.\.<\/button>/);
  });
});

describe('toProfileUpdate', () => {
  it('フォームの表示名と自己紹介とアバターを取り出す', () => {
    const form = new FormData();
    form.set('display_name', '岩佐');
    form.set('note', '自己紹介');
    const avatar = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    form.set('avatar', avatar);

    expect(toProfileUpdate(form)).toEqual({ displayName: '岩佐', note: '自己紹介', avatar });
  });

  it('画像を選んでいなければ avatar を送らず、空の入力は空文字で送る', () => {
    const form = new FormData();
    form.set('display_name', '');
    form.set('note', '');
    form.set('avatar', new File([], '', { type: 'application/octet-stream' }));

    expect(toProfileUpdate(form)).toEqual({ displayName: '', note: '', avatar: undefined });
  });
});
