import type { PostDestination } from '../../domain/post/postDestination.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import { blueskyCrosspostNotice } from './blueskyCrosspostMark.ts';
import type { PostVisibility } from './postVisibility.ts';
import { PostVisibilitySelect } from './PostVisibilitySelect.tsx';

type Props = Readonly<{
  value: PostVisibility;
  onChange: (value: PostVisibility) => void;
  parentVisibility?: Visibility;
  destination?: PostDestination;
  disabled: boolean;
  name: string;
  id: string;
}>;

export const ReplyVisibilityField = ({ value, onChange, parentVisibility, destination, disabled, name, id }: Props) => {
  const isParentDirect = parentVisibility === 'direct';
  const crosspostNotice = isParentDirect || destination === undefined
    ? undefined
    : blueskyCrosspostNotice(destination, '', false, value);
  return (
    <>
      {isParentDirect
        ? (
          <p class='text-xs text-charcoal-light dark:text-gray-400'>
            {destination === 'both'
              ? '返信先がダイレクトなので、返信もダイレクトになり、Bluesky には送りません'
              : '返信先がダイレクトなので、返信もダイレクトになります'}
          </p>
        )
        : (
          <PostVisibilitySelect
            value={value}
            onChange={onChange}
            name={name}
            id={id}
            disabled={disabled}
            maxVisibility={parentVisibility}
          />
        )}
      {crosspostNotice !== undefined && (
        <p class='mt-2 text-xs text-charcoal-light dark:text-gray-400'>{crosspostNotice}</p>
      )}
    </>
  );
};
