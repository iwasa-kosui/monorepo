import type { BlueskyClientError } from '../../../ports/blueskyClient.ts';

const operationPattern = /^([A-Za-z][A-Za-z0-9._]{0,127}) (?:failed|request failed|returned|received|skipped)\b/;
const codePattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export type BlueskyFailureLog = Readonly<{
  event: 'bluesky_client_failure';
  kind: BlueskyClientError['kind'];
  status: number | null;
  code: string | null;
  operation: string | null;
  responseStatus: number;
}>;

export const blueskyFailureLogOf = (error: BlueskyClientError, responseStatus: number): BlueskyFailureLog => ({
  event: 'bluesky_client_failure',
  kind: error.kind,
  status: error.status ?? null,
  code: error.code !== undefined && codePattern.test(error.code) ? error.code : null,
  operation: operationPattern.exec(error.message)?.[1] ?? null,
  responseStatus,
});

export const logBlueskyFailure = (error: BlueskyClientError, responseStatus: number): void => {
  try {
    console.warn(JSON.stringify(blueskyFailureLogOf(error, responseStatus)));
  } catch {
    return;
  }
};
