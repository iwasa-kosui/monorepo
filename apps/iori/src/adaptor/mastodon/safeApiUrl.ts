import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';

const isAbsolute = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export const toSafeApiUrl = (value: string | null | undefined, baseUrl: string): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (isAbsolute(trimmed)) return safeAbsoluteUrl(trimmed);
  try {
    return safeAbsoluteUrl(new URL(trimmed, baseUrl).href);
  } catch {
    return undefined;
  }
};
