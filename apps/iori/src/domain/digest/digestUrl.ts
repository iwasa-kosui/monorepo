const UTM_PREFIX = 'utm_';
const ROUTING_FRAGMENT = /^#[/!]/;

const withoutUtmQuery = (search: string): string => {
  const kept = search.slice(1).split('&').filter((part) => !part.toLowerCase().startsWith(UTM_PREFIX));
  return search === '' || kept.length === 0 ? '' : `?${kept.join('&')}`;
};

export const normalizeDigestUrl = (url: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
  const fragment = ROUTING_FRAGMENT.test(parsed.hash) ? parsed.hash : '';
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}${
    withoutUtmQuery(parsed.search)
  }${fragment}`;
};
