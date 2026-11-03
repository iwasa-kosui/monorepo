export type FollowTarget =
  | Readonly<{ type: 'search'; query: string }>
  | Readonly<{ type: 'local' }>
  | Readonly<{ type: 'unsupported' }>;

const urlScheme = /^[a-z][a-z0-9+.-]*:\/\//i;

export const parseFollowTarget = (input: string, ownHost: string): FollowTarget => {
  const trimmed = input.trim();
  if (urlScheme.test(trimmed)) {
    if (!/^https:\/\//i.test(trimmed)) {
      return { type: 'unsupported' };
    }
    try {
      return new URL(trimmed).host.toLowerCase() === ownHost.toLowerCase()
        ? { type: 'local' }
        : { type: 'search', query: trimmed };
    } catch {
      return { type: 'unsupported' };
    }
  }
  const acct = trimmed.replace(/^acct:/i, '').replace(/^@/, '');
  const separator = acct.lastIndexOf('@');
  if (separator === -1 || acct.slice(separator + 1).toLowerCase() === ownHost.toLowerCase()) {
    return { type: 'local' };
  }
  return { type: 'search', query: acct };
};
