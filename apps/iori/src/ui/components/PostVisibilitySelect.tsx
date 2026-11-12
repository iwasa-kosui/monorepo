import type { PostVisibility } from './postVisibility.ts';

type Props = Readonly<{
  value: PostVisibility;
  onChange: (value: PostVisibility) => void;
  name: string;
  id?: string;
}>;

const options: ReadonlyArray<Readonly<{ value: PostVisibility; label: string; description: string }>> = [
  { value: 'public', label: '公開', description: 'だれでも見られ、公開タイムラインにも出ます' },
  { value: 'unlisted', label: '未収載', description: 'だれでも見られますが、公開タイムラインには出ません' },
  { value: 'private', label: 'フォロワー限定', description: 'フォロワーだけが見られます' },
];

export const PostVisibilitySelect = ({ value, onChange, name, id }: Props) => {
  const descriptionId = `${id ?? name}-description`;
  const selected = options.find((option) => option.value === value);
  return (
    <div>
      <div
        role='radiogroup'
        aria-label='公開範囲'
        aria-describedby={descriptionId}
        class='flex flex-wrap items-center gap-3 text-xs text-charcoal-light dark:text-gray-400'
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
      <p id={descriptionId} class='mt-1 text-xs text-charcoal-light dark:text-gray-400'>
        {selected?.description}
      </p>
    </div>
  );
};
