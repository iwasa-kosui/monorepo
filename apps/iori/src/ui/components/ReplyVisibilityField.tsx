import type { Visibility } from '../../domain/post/visibility.ts';
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
