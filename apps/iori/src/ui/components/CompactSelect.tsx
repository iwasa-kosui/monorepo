import type { Child } from 'hono/jsx';

export type CompactSelectOption<T extends string> = Readonly<{
  value: T;
  label: string;
  disabled?: boolean;
}>;

type Props<T extends string> = Readonly<{
  value: T;
  options: ReadonlyArray<CompactSelectOption<T>>;
  onChange: (value: T) => void;
  name: string;
  ariaLabel: string;
  icon: Child;
  id?: string;
  title?: string;
  describedBy?: string;
  disabled?: boolean;
}>;

/**
 * 投稿欄のツールバーに並べる、アイコン付きの小さなセレクト。
 * ラジオボタンを横に並べるより場所を取らず、スマートフォンではネイティブのピッカーが開く。
 */
export const CompactSelect = <T extends string>({
  value,
  options,
  onChange,
  name,
  ariaLabel,
  icon,
  id,
  title,
  describedBy,
  disabled = false,
}: Props<T>) => (
  <span
    class={`relative inline-flex items-center rounded-full border border-warm-gray-dark dark:border-gray-600 text-xs text-charcoal-light dark:text-gray-300 transition-colors ${
      disabled ? 'opacity-50' : 'hover:border-terracotta/60 hover:text-charcoal dark:hover:text-white'
    }`}
  >
    <span aria-hidden='true' class='pointer-events-none absolute left-2 flex items-center'>{icon}</span>
    <select
      id={id}
      name={name}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      title={title}
      value={value}
      disabled={disabled}
      onChange={(e: Event) => {
        const next = options.find((option) => option.value === (e.target as HTMLSelectElement).value);
        if (next !== undefined) onChange(next.value);
      }}
      class={`appearance-none [field-sizing:content] bg-transparent rounded-full py-1 pl-7 pr-6 focus:outline-none focus:ring-2 focus:ring-terracotta/30 ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} selected={option.value === value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
    <svg
      aria-hidden='true'
      class='pointer-events-none absolute right-2 h-3 w-3'
      fill='none'
      viewBox='0 0 24 24'
      stroke='currentColor'
    >
      <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7' />
    </svg>
  </span>
);

export const GlobeIcon = () => (
  <svg class='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
    <path
      stroke-linecap='round'
      stroke-linejoin='round'
      stroke-width='2'
      d='M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.5-2.5 3.5-5.5 3.5-9S14.5 5.5 12 3m0 18c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3M3.5 9h17M3.5 15h17'
    />
  </svg>
);

export const SendIcon = () => (
  <svg class='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
    <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 12L3.27 3.13A59.77 59.77 0 0121.49 12 59.77 59.77 0 013.27 20.88L6 12zm0 0h7.5' />
  </svg>
);
