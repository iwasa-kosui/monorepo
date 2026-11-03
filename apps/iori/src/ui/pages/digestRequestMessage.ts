export type DigestRequestFailure = Readonly<{
  status?: number;
  error?: string;
  retryAfterSeconds?: number;
}>;

export const DIGEST_REQUEST_PENDING_LABEL = '生成中…（30秒ほどかかります）';

export const buildDigestRequestFailureMessage = (
  { status, error, retryAfterSeconds }: DigestRequestFailure,
): string => {
  if (status === 409 && error === 'Digest already published') {
    return '今日のダイジェストは公開済みのため、作り直せません。';
  }
  if (status === 409 && error === 'Digest request too soon') {
    return retryAfterSeconds === undefined
      ? '続けて作ることはできません。しばらくしてからもう一度お試しください。'
      : `続けて作ることはできません。${retryAfterSeconds}秒後にもう一度お試しください。`;
  }
  if (status === 429) return '今日はこれ以上作れません（1日3回まで）。';
  return 'ダイジェストを作れませんでした。時間をおいてもう一度お試しください。';
};
