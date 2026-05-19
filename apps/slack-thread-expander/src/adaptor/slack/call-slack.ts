import { Result } from '@praha/byethrow';
import type { z } from 'zod';

import type { SlackApiError } from '../../domain/slack-api-error.ts';

const SLACK_API_BASE = 'https://slack.com/api';

type Payload = Record<string, string | number | boolean | undefined>;

const buildOptions = (
  token: string,
  payload: Payload,
): GoogleAppsScript.URL_Fetch.URLFetchRequestOptions => ({
  method: 'post',
  contentType: 'application/x-www-form-urlencoded; charset=utf-8',
  headers: { Authorization: `Bearer ${token}` },
  payload: Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ),
  muteHttpExceptions: true,
  followRedirects: false,
});

const fetchHttp = (
  url: string,
  options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions,
): Result.Result<GoogleAppsScript.URL_Fetch.HTTPResponse, SlackApiError> => {
  try {
    return Result.succeed(UrlFetchApp.fetch(url, options));
  } catch (e) {
    return Result.fail({
      kind: 'network',
      message: e instanceof Error ? e.message : String(e),
    });
  }
};

const ensureHttpOk = (
  response: GoogleAppsScript.URL_Fetch.HTTPResponse,
): Result.Result<string, SlackApiError> => {
  const status = response.getResponseCode();
  const body = response.getContentText();
  return status >= 200 && status < 300
    ? Result.succeed(body)
    : Result.fail({ kind: 'http', status, body });
};

const parseJson = (body: string): Result.Result<unknown, SlackApiError> => {
  try {
    return Result.succeed(JSON.parse(body));
  } catch (e) {
    return Result.fail({
      kind: 'parse',
      message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
};

const validateSchema = <T extends { ok: boolean; error?: string }>(
  schema: z.ZodType<T>,
) =>
(raw: unknown): Result.Result<T, SlackApiError> => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Result.fail({ kind: 'parse', message: parsed.error.message });
  }
  if (!parsed.data.ok) {
    return Result.fail({ kind: 'slack', error: parsed.data.error ?? 'unknown' });
  }
  // generic T では Result.succeed の ResultFor が ResultAsync を排除しきれないため、
  // Success リテラルを直接構築して同期 Result に確定させる。
  const success: Result.Success<T> = { type: 'Success', value: parsed.data };
  return success;
};

export const callSlack = <T extends { ok: boolean; error?: string }>(
  token: string,
  method: string,
  payload: Payload,
  schema: z.ZodType<T>,
): Result.Result<T, SlackApiError> =>
  Result.pipe(
    fetchHttp(`${SLACK_API_BASE}/${method}`, buildOptions(token, payload)),
    Result.andThen(ensureHttpOk),
    Result.andThen(parseJson),
    Result.andThen(validateSchema(schema)),
  );
