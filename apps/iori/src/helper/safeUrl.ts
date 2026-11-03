export const safeUrl = (value: string | null | undefined): string | undefined => {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (trimmed.startsWith('/')) {
    const second = trimmed.charAt(1);
    return second === '/' || second === '\\' ? undefined : trimmed;
  }
  try {
    const { protocol } = new URL(trimmed);
    return protocol === 'https:' || protocol === 'http:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
};
