import { describe, expect, it } from 'vitest';

import { isEmptyProfileUpdate, toProfileUpdate } from './profileUpdate.ts';

describe('toProfileUpdate', () => {
  const initial = { displayName: '岩佐', note: '自己紹介' };

  it('初期値から変えた表示名と自己紹介とアバターを取り出す', () => {
    const form = new FormData();
    form.set('display_name', '岩佐こうすい');
    form.set('note', '新しい自己紹介');
    const avatar = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    form.set('avatar', avatar);

    expect(toProfileUpdate(form, initial)).toEqual({ displayName: '岩佐こうすい', note: '新しい自己紹介', avatar });
  });

  it('アイコンだけ変えたとき、display_name と note を送らない', () => {
    const form = new FormData();
    form.set('display_name', '岩佐');
    form.set('note', '自己紹介');
    const avatar = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    form.set('avatar', avatar);

    const update = toProfileUpdate(form, initial);

    expect(update).toEqual({ avatar });
    expect(update).not.toHaveProperty('displayName');
    expect(update).not.toHaveProperty('note');
  });

  it('表示名だけ変えたとき、display_name だけを送る', () => {
    const form = new FormData();
    form.set('display_name', '新しい名前');
    form.set('note', '自己紹介');
    form.set('avatar', new File([], '', { type: 'application/octet-stream' }));

    const update = toProfileUpdate(form, initial);

    expect(update).toEqual({ displayName: '新しい名前' });
    expect(isEmptyProfileUpdate(update)).toBe(false);
  });

  it('入力を空にしたときは空文字で送り、何も変えていなければ空の更新になる', () => {
    const cleared = new FormData();
    cleared.set('display_name', '');
    cleared.set('note', '');

    const unchanged = new FormData();
    unchanged.set('display_name', '岩佐');
    unchanged.set('note', '自己紹介');
    unchanged.set('avatar', new File([], '', { type: 'application/octet-stream' }));

    expect(toProfileUpdate(cleared, initial)).toEqual({ displayName: '', note: '' });
    expect(isEmptyProfileUpdate(toProfileUpdate(unchanged, initial))).toBe(true);
  });

  it('自己紹介の改行の表記が違うだけなら、変えていないものとして扱う', () => {
    const form = new FormData();
    form.set('display_name', '岩佐');
    form.set('note', '一行目\r\n二行目');

    expect(toProfileUpdate(form, { displayName: '岩佐', note: '一行目\n二行目' })).toEqual({});
  });
});
