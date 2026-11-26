export const TEXT_SIZES = ['small', 'standard', 'large'] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

export const DEFAULT_TEXT_SIZE: TextSize = 'standard';

export const TEXT_SIZE_KEY = 'es:text-size';

export const TEXT_SIZE_ATTRIBUTE = 'data-text-size';

export const TEXT_SIZE_LABELS: Readonly<Record<TextSize, string>> = {
  small: '小',
  standard: '標準',
  large: '大',
};

export const isTextSize = (value: unknown): value is TextSize => TEXT_SIZES.some((size) => size === value);

export const parseTextSize = (raw: string | null | undefined): TextSize => isTextSize(raw) ? raw : DEFAULT_TEXT_SIZE;

export const textSizeAttribute = (size: TextSize): TextSize | null => size === DEFAULT_TEXT_SIZE ? null : size;
