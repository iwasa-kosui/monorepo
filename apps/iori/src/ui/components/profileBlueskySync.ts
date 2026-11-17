import {
  BLUESKY_DESCRIPTION_MAX_GRAPHEMES,
  BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES,
  type BlueskyProfileSubmission,
  isWithinGraphemeLimit,
  selectedImageFile,
} from './blueskyProfileEdit.ts';

/** Fediverse のプロフィールのフォームに入っている内容。Bluesky へ同じ内容を保存するときに使う */
export type ProfileSyncForm = Readonly<{
  displayName: string;
  note: string;
  avatar: File | undefined;
  header: File | undefined;
  removeHeader: boolean;
}>;

const textOf = (value: FormDataEntryValue | null): string => typeof value === 'string' ? value : '';

export const readProfileSyncForm = (form: FormData): ProfileSyncForm => {
  const header = selectedImageFile(form.get('header'));
  return {
    displayName: textOf(form.get('display_name')),
    note: textOf(form.get('note')),
    avatar: selectedImageFile(form.get('avatar')),
    header,
    removeHeader: header === undefined && form.get('remove_header') !== null,
  };
};

/** Bluesky は Fediverse より文字数の上限が短い。超えているときは、どちらにも保存する前に止める */
export const blueskySyncTextProblem = (
  form: Pick<ProfileSyncForm, 'displayName' | 'note'>,
): string | undefined => {
  if (!isWithinGraphemeLimit(form.displayName.trim(), BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES)) {
    return `Bluesky の表示名は ${BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES} 文字までです。短くするか、Bluesky への保存を外してください`;
  }
  if (!isWithinGraphemeLimit(form.note.trim(), BLUESKY_DESCRIPTION_MAX_GRAPHEMES)) {
    return `Bluesky の自己紹介は ${BLUESKY_DESCRIPTION_MAX_GRAPHEMES} 文字までです。短くするか、Bluesky への保存を外してください`;
  }
  return undefined;
};

/**
 * フォームの内容から Bluesky へ送る内容を組み立てる。
 * 画像は選んだものだけを差し替え、選んでいないアバターは Bluesky 側のものを残す。
 */
export const toBlueskyProfileSubmission = (
  form: ProfileSyncForm,
  images: Readonly<{ avatar: File | undefined; banner: File | undefined }>,
  swapCid: string | null,
): BlueskyProfileSubmission => ({
  displayName: form.displayName,
  description: form.note,
  avatar: images.avatar,
  banner: images.banner,
  removeAvatar: false,
  removeBanner: form.removeHeader,
  swapCid,
});
