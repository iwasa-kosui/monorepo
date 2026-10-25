import { DEFAULT_STAGING_SMOKE_CHECKS, runCloudflareSmoke } from './run-cloudflare-smoke.mjs';
export const smokeReviewedTarget = async ({ target, hostname, token, signal, fetchRequest }) => {
  const a = target.admission;
  if (![a.workerHostname, a.hostname].includes(hostname)) throw new Error('Invalid smoke host.');
  const paths = {
    WebFinger: `/.well-known/webfinger?resource=acct:${a.smoke.username}@${a.hostname}`,
    actor: `/users/${a.smoke.username}`,
    outbox: `/users/${a.smoke.username}/outbox`,
    'upload retrieval': `/uploads/${a.smoke.uploadFilename}`,
    'OGP PNG': `/api/og/articles/${a.smoke.articleId}`,
  };
  const checks = DEFAULT_STAGING_SMOKE_CHECKS.map(check => ({
    ...check,
    ...(paths[check.name] ? { path: paths[check.name] } : {}),
    ...(check.name === 'upload retrieval'
      ? {
        expectedContentType:
          ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })[
            a.smoke.uploadFilename.split('.').at(-1).toLowerCase()
          ],
      }
      : {}),
  }));
  const result = await runCloudflareSmoke({
    baseUrl: `https://${hostname}`,
    expectedOrigin: `https://${hostname}`,
    allowedHostname: hostname,
    checks,
    smokeQueueToken: token,
    signal,
    fetchRequest,
  });
  signal.throwIfAborted();
  if (!result.ok) throw new Error('Reviewed smoke failed.');
  return { checks: result.checks.length };
};
