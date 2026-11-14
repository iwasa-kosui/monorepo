import type { PostDestination } from '../../domain/post/postDestination.ts';
import { CompactSelect, type CompactSelectOption, SendIcon } from './CompactSelect.tsx';

type Props = Readonly<{
  value: PostDestination;
  onChange: (value: PostDestination) => void;
  name: string;
  allowBlueskyOnly?: boolean;
  disabled?: boolean;
}>;

const baseOptions: ReadonlyArray<CompactSelectOption<PostDestination>> = [
  { value: 'both', label: '全体' },
  { value: 'fediverse', label: 'Fediverse のみ' },
];

const blueskyOnlyOption: CompactSelectOption<PostDestination> = { value: 'bluesky', label: 'Bluesky のみ' };

const titles: Readonly<Record<PostDestination, string>> = {
  both: 'Fediverse に投稿し、Bluesky にも送ります',
  fediverse: 'Fediverse にだけ投稿します',
  bluesky: 'Bluesky にだけ投稿します',
};

export const PostDestinationSelect = ({ value, onChange, name, allowBlueskyOnly = false, disabled = false }: Props) => (
  <CompactSelect
    value={value}
    options={allowBlueskyOnly ? [...baseOptions, blueskyOnlyOption] : baseOptions}
    onChange={onChange}
    name={name}
    ariaLabel='送り先'
    title={titles[value]}
    icon={<SendIcon />}
    disabled={disabled}
  />
);
