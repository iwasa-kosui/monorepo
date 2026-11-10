const AUTHORIZE_PATH = '/oauth/authorize';

export const resolveNextPath = (next: string | null, origin: string): string => {
  if (next === null) {
    return '/';
  }
  try {
    const url = new URL(next, origin);
    return url.origin === origin && url.pathname === AUTHORIZE_PATH ? url.pathname + url.search : '/';
  } catch {
    return '/';
  }
};
