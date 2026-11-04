const UTM_PREFIX = 'utm_';

export const normalizeDigestUrl = (url: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith(UTM_PREFIX)) parsed.searchParams.delete(key);
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
};
