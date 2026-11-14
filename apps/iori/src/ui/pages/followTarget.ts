export type FollowTarget =
  | Readonly<{ type: 'search'; query: string }>
  | Readonly<{ type: 'local'; username: string }>
  | Readonly<{ type: 'unsupported' }>;

const urlScheme = /^[a-z][a-z0-9+.-]*:\/\//i;

// 自サーバーのプロフィール URL（/users/:username か /@:username）からユーザー名を取り出す
const localUsernameOfPath = (pathname: string): string | undefined => {
  const matched = /^\/(?:users\/|@)([^/]+)\/?$/.exec(pathname);
  return matched?.[1] === undefined ? undefined : decodeURIComponent(matched[1]);
};

const localTarget = (username: string | undefined): FollowTarget =>
  username === undefined || username === '' ? { type: 'unsupported' } : { type: 'local', username };

export const parseFollowTarget = (input: string, ownHost: string): FollowTarget => {
  const trimmed = input.trim();
  if (urlScheme.test(trimmed)) {
    if (!/^https:\/\//i.test(trimmed)) {
      return { type: 'unsupported' };
    }
    try {
      const url = new URL(trimmed);
      return url.host.toLowerCase() === ownHost.toLowerCase()
        ? localTarget(localUsernameOfPath(url.pathname))
        : { type: 'search', query: trimmed };
    } catch {
      return { type: 'unsupported' };
    }
  }
  const acct = trimmed.replace(/^acct:/i, '').replace(/^@/, '');
  const separator = acct.lastIndexOf('@');
  if (separator === -1) {
    return localTarget(acct);
  }
  if (acct.slice(separator + 1).toLowerCase() === ownHost.toLowerCase()) {
    return localTarget(acct.slice(0, separator));
  }
  return { type: 'search', query: acct };
};
