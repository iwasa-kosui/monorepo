import { describe, expect, it } from 'vitest';

import {
  BLUESKY_DESCRIPTION_MAX_GRAPHEMES,
  BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES,
  blueskyProfileImageProblem,
  buildBlueskyProfileFormData,
  countGraphemes,
  editStateAfterSave,
  editStateOfLoaded,
  graphemeCounterLabel,
  isWithinGraphemeLimit,
  selectedImageFile,
} from './blueskyProfileEdit.ts';

const image = (name: string, type: string, size: number): File => new File([new Uint8Array(size)], name, { type });

describe('countGraphemes', () => {
  it('数えるのは UTF-16 の長さではなく書記素の数', () => {
    expect(countGraphemes('')).toBe(0);
    expect(countGraphemes('岩佐')).toBe(2);
    expect(countGraphemes('😀')).toBe(1);
    expect(countGraphemes('👨‍👩‍👧‍👦')).toBe(1);
    expect(countGraphemes('🇯🇵')).toBe(1);
    expect(countGraphemes('é')).toBe(1);
  });
});

describe('isWithinGraphemeLimit', () => {
  it('表示名は 64 書記素まで、自己紹介は 256 書記素まで許す', () => {
    expect(isWithinGraphemeLimit('あ'.repeat(BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES), BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES))
      .toBe(true);
    expect(
      isWithinGraphemeLimit('あ'.repeat(BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES + 1), BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES),
    ).toBe(false);
    expect(isWithinGraphemeLimit('😀'.repeat(BLUESKY_DESCRIPTION_MAX_GRAPHEMES), BLUESKY_DESCRIPTION_MAX_GRAPHEMES))
      .toBe(true);
    expect(isWithinGraphemeLimit('😀'.repeat(BLUESKY_DESCRIPTION_MAX_GRAPHEMES + 1), BLUESKY_DESCRIPTION_MAX_GRAPHEMES))
      .toBe(false);
  });
});

describe('graphemeCounterLabel', () => {
  it('上限以内なら残りを、超えたら超過を出す', () => {
    expect(graphemeCounterLabel('', 64)).toBe('残り 64 文字');
    expect(graphemeCounterLabel('あ'.repeat(64), 64)).toBe('残り 0 文字');
    expect(graphemeCounterLabel('あ'.repeat(65), 64)).toBe('1 文字超えています');
  });
});

describe('blueskyProfileImageProblem', () => {
  it('JPEG と PNG の 1,000,000 バイト以下を通す', () => {
    expect(blueskyProfileImageProblem({ type: 'image/jpeg', size: 1_000_000 }, 'アバター')).toBeUndefined();
    expect(blueskyProfileImageProblem({ type: 'image/png', size: 1 }, 'バナー')).toBeUndefined();
  });

  it('JPEG と PNG 以外は、種類の理由で断る', () => {
    expect(blueskyProfileImageProblem({ type: 'image/webp', size: 10 }, 'アバター'))
      .toBe('アバターは JPEG か PNG の画像を選んでください');
    expect(blueskyProfileImageProblem({ type: 'image/gif', size: 10 }, 'バナー'))
      .toBe('バナーは JPEG か PNG の画像を選んでください');
  });

  it('1,000,000 バイトを超えたら、大きさの理由で断る', () => {
    expect(blueskyProfileImageProblem({ type: 'image/jpeg', size: 1_000_001 }, 'バナー'))
      .toBe('バナーは 1MB 以下の画像にしてください');
  });
});

describe('selectedImageFile', () => {
  it('選んだファイルだけを返し、未選択（サイズ 0）と文字列は undefined にする', () => {
    const file = image('a.png', 'image/png', 3);
    expect(selectedImageFile(file)).toBe(file);
    expect(selectedImageFile(image('', 'application/octet-stream', 0))).toBeUndefined();
    expect(selectedImageFile('text')).toBeUndefined();
    expect(selectedImageFile(null)).toBeUndefined();
  });
});

describe('buildBlueskyProfileFormData', () => {
  const base = {
    displayName: '岩佐',
    description: '自己紹介',
    avatar: undefined,
    banner: undefined,
    removeAvatar: false,
    removeBanner: false,
    swapCid: 'bafycurrent',
  } as const;

  it('表示名と自己紹介は常に入れ、画像と削除フラグは指定がなければ入れない', () => {
    const body = buildBlueskyProfileFormData(base);

    expect(body.has('avatar') || body.has('banner') || body.has('remove_avatar') || body.has('remove_banner')).toBe(
      false,
    );
    expect(body.get('display_name')).toBe('岩佐');
    expect(body.get('description')).toBe('自己紹介');
  });

  it('swap_cid に、フォームを開いたときの cid を入れる。レコードが無かった（null）ときは空文字にする', () => {
    expect(buildBlueskyProfileFormData(base).get('swap_cid')).toBe('bafycurrent');
    expect(buildBlueskyProfileFormData({ ...base, swapCid: null }).get('swap_cid')).toBe('');
  });

  it('選んだ画像を avatar と banner に入れる', () => {
    const avatar = image('a.png', 'image/png', 3);
    const banner = image('b.jpg', 'image/jpeg', 4);
    const body = buildBlueskyProfileFormData({ ...base, avatar, banner });

    expect((body.get('avatar') as File).name).toBe('a.png');
    expect((body.get('banner') as File).name).toBe('b.jpg');
  });

  it('削除を指定したら、削除フラグを true で入れる', () => {
    const body = buildBlueskyProfileFormData({ ...base, removeAvatar: true, removeBanner: true });

    expect(body.get('remove_avatar')).toBe('true');
    expect(body.get('remove_banner')).toBe('true');
    expect(body.has('avatar')).toBe(false);
    expect(body.has('banner')).toBe(false);
  });

  it('同じ画像に新しいファイルと削除の両方があるときは、ファイルを送り削除フラグは入れない', () => {
    const body = buildBlueskyProfileFormData({
      ...base,
      avatar: image('a.png', 'image/png', 3),
      removeAvatar: true,
      removeBanner: true,
    });

    expect(body.has('avatar')).toBe(true);
    expect(body.has('remove_avatar')).toBe(false);
    expect(body.get('remove_banner')).toBe('true');
  });

  it('サイズ 0 のファイルは入れない', () => {
    const body = buildBlueskyProfileFormData({
      ...base,
      avatar: image('', 'application/octet-stream', 0),
      banner: image('', 'application/octet-stream', 0),
    });

    expect(body.has('avatar')).toBe(false);
    expect(body.has('banner')).toBe(false);
  });
});

describe('editStateOfLoaded', () => {
  it('取得したプロフィールの表示名と自己紹介をフォームの値にし、null は空文字にする', () => {
    const loaded = { displayName: '岩佐', description: null, cid: 'bafy1' };

    expect(editStateOfLoaded(loaded)).toEqual({
      profile: loaded,
      form: { displayName: '岩佐', description: '' },
    });
  });
});

describe('editStateAfterSave', () => {
  const profile = { displayName: '旧名', description: '旧紹介', cid: 'bafyold', avatar: 'old.jpg' };
  const current = { profile, form: { displayName: '送った名前', description: '送った紹介' } };

  it('取り直したプロフィールで cid と画像を更新し、フォームの値は送った値のまま維持する', () => {
    const refetched = { displayName: '古い反映', description: '古い反映', cid: 'bafynew', avatar: 'new.jpg' };

    expect(editStateAfterSave(current, { cid: 'bafynew' }, refetched)).toEqual({
      profile: refetched,
      form: { displayName: '送った名前', description: '送った紹介' },
    });
  });

  it('取り直しに失敗したら、現在のプロフィールの cid だけを保存の応答の cid にする', () => {
    expect(editStateAfterSave(current, { cid: 'bafynew' }, undefined)).toEqual({
      profile: { ...profile, cid: 'bafynew' },
      form: { displayName: '送った名前', description: '送った紹介' },
    });
  });
});
