const RELATIVE_BASE = 'https://base.invalid';

export const safeAbsoluteUrl = (value: string | null | undefined): string | undefined => {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  try {
    const { protocol } = new URL(trimmed);
    return protocol === 'https:' || protocol === 'http:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
};

export const safeUrl = (value: string | null | undefined): string | undefined => {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) {
    if (/[\t\n\r]/.test(trimmed)) return undefined;
    try {
      return new URL(trimmed, RELATIVE_BASE).origin === RELATIVE_BASE ? trimmed : undefined;
    } catch {
      return undefined;
    }
  }
  return safeAbsoluteUrl(trimmed);
};
