import { describe, expect, it } from 'vitest';

import { blueskySyncTextProblem, readProfileSyncForm } from './profileBlueskySync.ts';

const image = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/png' });

describe('readProfileSyncForm', () => {
  it('新しいバナーを選んでいるときは、削除のチェックより差し替えを優先する', () => {
    const form = new FormData();
    form.set('display_name', '岩佐');
    form.set('note', '自己紹介');
    form.set('header', image('h.png'));
    form.set('remove_header', 'on');

    const read = readProfileSyncForm(form);

    expect(read.header?.name).toBe('h.png');
    expect(read.removeHeader).toBe(false);
  });

  it('ファイルを選んでいない入力欄（空のファイル）は、画像なしとして扱う', () => {
    const form = new FormData();
    form.set('avatar', new File([], '', { type: 'application/octet-stream' }));
    form.set('header', new File([], '', { type: 'application/octet-stream' }));
    form.set('remove_header', 'on');

    expect(readProfileSyncForm(form)).toMatchObject({ avatar: undefined, header: undefined, removeHeader: true });
  });
});

describe('blueskySyncTextProblem', () => {
  it('Fediverse では収まるが Bluesky の上限を超える自己紹介を止める', () => {
    expect(blueskySyncTextProblem({ displayName: '岩佐', note: 'あ'.repeat(256) })).toBeUndefined();
    expect(blueskySyncTextProblem({ displayName: '岩佐', note: 'あ'.repeat(257) })).toContain('自己紹介');
  });

  it('結合絵文字は 1 文字として数える', () => {
    const family = '👨‍👩‍👧‍👦';

    expect(blueskySyncTextProblem({ displayName: family.repeat(64), note: '' })).toBeUndefined();
    expect(blueskySyncTextProblem({ displayName: family.repeat(65), note: '' })).toContain('表示名');
  });
});
