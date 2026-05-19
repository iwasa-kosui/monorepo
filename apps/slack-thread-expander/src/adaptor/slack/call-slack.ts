import type { Result } from '@iwasa-kosui/result';
import { err, ok } from '@iwasa-kosui/result';
import type { z } from 'zod';

import type { SlackApiError } from '../../domain/slack-api-error.ts';

const SLACK_API_BASE = 'https://slack.com/api';

type Payload = Record<string, string | number | boolean | undefined>;

const buildOptions = (
  token: string,
  payload: Payload,
): GoogleAppsScript.URL_Fetch.URLFetchRequestOptions => {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) cleaned[key] = String(value);
  }
  return {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded; charset=utf-8',
    headers: { Authorization: `Bearer ${token}` },
    payload: cleaned,
    muteHttpExceptions: true,
    followRedirects: false,
  };
};

export const callSlack = <T extends { ok: boolean; error?: string }>(
  token: string,
  method: string,
  payload: Payload,
  schema: z.ZodType<T>,
): Result<T, SlackApiError> => {
  const url = `${SLACK_API_BASE}/${method}`;
  let response: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    response = UrlFetchApp.fetch(url, buildOptions(token, payload));
  } catch (e) {
    return err({
      kind: 'network',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    return err({ kind: 'http', status, body });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch (e) {
    return err({
      kind: 'parse',
      message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return err({ kind: 'parse', message: parsed.error.message });
  }
  if (!parsed.data.ok) {
    return err({ kind: 'slack', error: parsed.data.error ?? 'unknown' });
  }
  return ok(parsed.data);
};
