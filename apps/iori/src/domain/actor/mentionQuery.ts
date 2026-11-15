const USERNAME_PREFIX = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const HOST_PREFIX = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

export type MentionQuery = Readonly<{ username: string; host: string | undefined }>;

/**
 * `alice`・`@alice`・`alice@remo` のような入力途中の宛先を、ユーザー名とホストの前方一致の条件に分ける。
 * ホストを書きかけ（`alice@`）のときはホストで絞らない。宛先として書けない文字が混じれば undefined。
 */
export const parseMentionQuery = (raw: string): MentionQuery | undefined => {
  const [username, host, ...rest] = raw.trim().replace(/^@/, '').split('@');
  if (username === undefined || !USERNAME_PREFIX.test(username) || rest.length > 0) {
    return undefined;
  }
  if (host === undefined || host === '') {
    return { username, host: undefined };
  }
  return HOST_PREFIX.test(host) ? { username, host: host.toLowerCase() } : undefined;
};
