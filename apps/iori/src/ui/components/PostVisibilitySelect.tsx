import type { PostVisibility } from './postVisibility.ts';

type Props = Readonly<{
  value: PostVisibility;
  onChange: (value: PostVisibility) => void;
  name: string;
}>;

const options: ReadonlyArray<Readonly<{ value: PostVisibility; label: string; description: string }>> = [
  { value: 'public', label: '公開', description: 'だれでも見られ、公開タイムラインにも出ます' },
  { value: 'unlisted', label: '未収載', description: 'だれでも見られますが、公開タイムラインには出ません' },
  { value: 'private', label: 'フォロワー限定', description: 'フォロワーだけが見られます' },
];

export const PostVisibilitySelect = ({ value, onChange, name }: Props) => (
  <div
    role='radiogroup'
    aria-label='公開範囲'
    class='flex items-center gap-3 text-xs text-charcoal-light dark:text-gray-400'
  >
    {options.map((option) => (
      <label key={option.value} title={option.description} class='flex items-center gap-1 cursor-pointer'>
        <input
          type='radio'
          name={name}
          value={option.value}
          checked={value === option.value}
          onChange={() =>
            onChange(option.value)}
        />
        {option.label}
      </label>
    ))}
  </div>
);
