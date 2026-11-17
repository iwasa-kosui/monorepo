import { Username } from '../user/username.ts';
import type { AcctLookup } from './accountRelationship.ts';

/**
 * `alice`、`@alice`、`alice@remote.example`、`@alice@remote.example` を、探すアカウントの条件にする。
 * ホストが無いか自サーバーのホストならローカル、それ以外はリモートとして扱う。
 */
export const parseAcct = (acct: string, localHost: string): AcctLookup | undefined => {
  const [username, host, ...rest] = (acct.startsWith('@') ? acct.slice(1) : acct).split('@');
  if (username === undefined || username.length === 0 || rest.length > 0 || host === '') {
    return undefined;
  }
  if (host === undefined || host.toLowerCase() === localHost.toLowerCase()) {
    const parsed = Username.parse(username);
    return parsed.ok ? { type: 'local', username: parsed.val } : undefined;
  }
  return { type: 'remote', username, host: host.toLowerCase() };
};
