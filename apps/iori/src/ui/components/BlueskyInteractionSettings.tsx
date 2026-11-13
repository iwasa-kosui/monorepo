import type { BlueskyReplyAudience } from '../../domain/blueskyCrosspost/blueskyInteraction.ts';
import {
  type BlueskyInteractionDraft,
  type BlueskyReplyMode,
  isSelectedWithoutAudience,
} from './blueskyInteractionDraft.ts';

type Props = Readonly<{
  value: BlueskyInteractionDraft;
  onChange: (value: BlueskyInteractionDraft) => void;
  name: string;
  disabled?: boolean;
}>;

const replyModes: ReadonlyArray<Readonly<{ value: BlueskyReplyMode; label: string }>> = [
  { value: 'everyone', label: '誰でも' },
  { value: 'nobody', label: '返信を受け付けない' },
  { value: 'selected', label: '指定した人だけ' },
];

const audiences: ReadonlyArray<Readonly<{ value: BlueskyReplyAudience; label: string }>> = [
  { value: 'mention', label: 'メンションした人' },
  { value: 'following', label: 'フォローしている人' },
  { value: 'followers', label: 'フォロワー' },
];

const NO_AUDIENCE_NOTICE = '1人も選ばないまま投稿すると、返信を受け付けない設定になります';

export const BlueskyInteractionSettings = ({ value, onChange, name, disabled = false }: Props) => {
  const descriptionId = `${name}-description`;
  const noAudience = isSelectedWithoutAudience(value);
  const toggleAudience = (audience: BlueskyReplyAudience, checked: boolean) =>
    onChange({
      ...value,
      audiences: checked
        ? [...value.audiences.filter((current) => current !== audience), audience]
        : value.audiences.filter((current) => current !== audience),
    });
  return (
    <div class='flex flex-col gap-1 text-xs text-charcoal-light dark:text-gray-400'>
      <div role='radiogroup' aria-label='返信できる人' class='flex flex-wrap items-center gap-3'>
        <span>返信できる人</span>
        {replyModes.map((mode) => (
          <label
            key={mode.value}
            class={`flex items-center gap-1 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <input
              type='radio'
              name={`${name}-reply-mode`}
              value={mode.value}
              checked={value.replyMode === mode.value}
              disabled={disabled}
              onChange={() => onChange({ ...value, replyMode: mode.value })}
            />
            {mode.label}
          </label>
        ))}
      </div>
      {value.replyMode === 'selected' && (
        <div
          role='group'
          aria-label='返信できる人の指定'
          aria-describedby={noAudience ? descriptionId : undefined}
          class='ml-4 flex flex-wrap gap-3'
        >
          {audiences.map((audience) => (
            <label
              key={audience.value}
              class={`flex items-center gap-1 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <input
                type='checkbox'
                name={`${name}-reply-audience`}
                value={audience.value}
                checked={value.audiences.includes(audience.value)}
                disabled={disabled}
                onChange={(e) => toggleAudience(audience.value, (e.target as HTMLInputElement).checked)}
              />
              {audience.label}
            </label>
          ))}
        </div>
      )}
      {noAudience && <p id={descriptionId}>{NO_AUDIENCE_NOTICE}</p>}
      <label class={`flex items-center gap-1 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type='checkbox'
          name={`${name}-quote-disabled`}
          checked={value.quoteDisabled}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, quoteDisabled: (e.target as HTMLInputElement).checked })}
        />
        引用を許可しない
      </label>
    </div>
  );
};
