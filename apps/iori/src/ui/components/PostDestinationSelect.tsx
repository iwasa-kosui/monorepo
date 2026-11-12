import type { PostDestination } from '../../domain/post/postDestination.ts';

type Props = Readonly<{
  value: PostDestination;
  onChange: (value: PostDestination) => void;
  name: string;
  allowBlueskyOnly?: boolean;
}>;

export const PostDestinationSelect = ({ value, onChange, name, allowBlueskyOnly = false }: Props) => (
  <div
    role='radiogroup'
    aria-label='送り先'
    class='mr-auto flex items-center gap-3 text-xs text-charcoal-light dark:text-gray-400'
  >
    <label class='flex items-center gap-1 cursor-pointer'>
      <input
        type='radio'
        name={name}
        value='both'
        checked={value === 'both'}
        onChange={() => onChange('both')}
      />
      両方
    </label>
    <label class='flex items-center gap-1 cursor-pointer'>
      <input
        type='radio'
        name={name}
        value='fediverse'
        checked={value === 'fediverse'}
        onChange={() => onChange('fediverse')}
      />
      Fediverse だけ
    </label>
    {allowBlueskyOnly && (
      <label class='flex items-center gap-1 cursor-pointer'>
        <input
          type='radio'
          name={name}
          value='bluesky'
          checked={value === 'bluesky'}
          onChange={() => onChange('bluesky')}
        />
        Bluesky だけ
      </label>
    )}
  </div>
);
