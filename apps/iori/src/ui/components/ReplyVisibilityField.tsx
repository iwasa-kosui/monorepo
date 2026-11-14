import type { PostDestination } from '../../domain/post/postDestination.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import { blueskyCrosspostNotice } from './blueskyCrosspostMark.ts';
import type { PostVisibility } from './postVisibility.ts';
import { PostVisibilitySelect } from './PostVisibilitySelect.tsx';

type ControlProps = Readonly<{
  value: PostVisibility;
  onChange: (value: PostVisibility) => void;
  parentVisibility?: Visibility;
  disabled: boolean;
  name: string;
  id: string;
}>;

/** 返信欄のツールバーに置く公開範囲の選択。返信先がダイレクトなら選べないので、ダイレクトの印だけを出す */
export const ReplyVisibilityControl = ({ value, onChange, parentVisibility, disabled, name, id }: ControlProps) =>
  parentVisibility === 'direct'
    ? (
      <span class='inline-flex items-center rounded-full border border-warm-gray-dark dark:border-gray-600 px-2.5 py-1 text-xs text-charcoal-light dark:text-gray-300'>
        ダイレクト
      </span>
    )
    : (
      <PostVisibilitySelect
        value={value}
        onChange={onChange}
        name={name}
        id={id}
        disabled={disabled}
        maxVisibility={parentVisibility}
        variant='compact'
      />
    );

export const replyVisibilityNotice = (
  value: PostVisibility,
  parentVisibility: Visibility | undefined,
  destination: PostDestination | undefined,
): string | undefined => {
  if (parentVisibility === 'direct') {
    return destination === 'both'
      ? '返信先がダイレクトなので、返信もダイレクトになり、Bluesky には送りません'
      : '返信先がダイレクトなので、返信もダイレクトになります';
  }
  return destination === undefined ? undefined : blueskyCrosspostNotice(destination, '', false, value);
};

type NoticeProps = Readonly<{
  value: PostVisibility;
  parentVisibility?: Visibility;
  destination?: PostDestination;
}>;

/** 公開範囲と送り先から、必要なときだけ出す補足の一文 */
export const ReplyVisibilityNotice = ({ value, parentVisibility, destination }: NoticeProps) => {
  const notice = replyVisibilityNotice(value, parentVisibility, destination);
  return notice === undefined
    ? null
    : <p class='mt-2 text-xs text-charcoal-light dark:text-gray-400 flex-shrink-0'>{notice}</p>;
};
