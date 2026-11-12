import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlueskyClientError } from '../../../ports/blueskyClient.ts';
import { blueskyFailureLogOf, logBlueskyFailure } from './blueskyFailureLog.ts';

const clientError = (overrides: Partial<BlueskyClientError> = {}): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'chat.bsky.convo.getLog failed: status 500 InternalServerError',
  status: 500,
  code: 'InternalServerError',
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('blueskyFailureLogOf', () => {
  it('kind、Bluesky の status、code、操作の名前、iori の応答の status だけを持つ', () => {
    const log = blueskyFailureLogOf(clientError(), 502);

    expect(log).toEqual({
      event: 'bluesky_client_failure',
      kind: 'http',
      status: 500,
      code: 'InternalServerError',
      operation: 'chat.bsky.convo.getLog',
      responseStatus: 502,
    });
    expect(Object.keys(log)).toEqual(['event', 'kind', 'status', 'code', 'operation', 'responseStatus']);
  });

  it('chat_not_permitted は 400 InvalidToken と、操作の名前を持つ', () => {
    expect(
      blueskyFailureLogOf(
        clientError({
          kind: 'chat_not_permitted',
          message: 'chat.bsky.convo.listConvos failed: status 400 InvalidToken',
          status: 400,
          code: 'InvalidToken',
        }),
        403,
      ),
    ).toEqual({
      event: 'bluesky_client_failure',
      kind: 'chat_not_permitted',
      status: 400,
      code: 'InvalidToken',
      operation: 'chat.bsky.convo.listConvos',
      responseStatus: 403,
    });
  });

  it('status と code が無いとき null にする', () => {
    const { status: _status, code: _code, ...rest } = clientError({ kind: 'network' });
    const log = blueskyFailureLogOf({ ...rest, message: 'createSession request failed' }, 502);

    expect(log).toMatchObject({ kind: 'network', status: null, code: null, operation: 'createSession' });
  });

  it.each([
    'stored like uri is invalid',
    'did:plc:alice returned an unexpected response',
    'alice.bsky.social@example.com failed',
    '',
  ])('操作の名前の形でない message からは operation を作らない（%s）', (message) => {
    expect(blueskyFailureLogOf(clientError({ message }), 502).operation).toBeNull();
  });

  it('秘密値を含む入力から作っても、出すキーを限定し、値に秘密値を残さない', () => {
    const secrets = [
      'eyJhbGciOiJIUzI1NiJ9.access',
      'eyJhbGciOiJIUzI1NiJ9.refresh',
      'abcd-efgh-ijkl-mnop',
      'alice.bsky.social',
      'did:plc:alice',
      'こんにちは、秘密のメッセージ',
    ];
    const hostile = {
      ...clientError({
        message: `chat.bsky.convo.sendMessage failed: status 400 ${secrets.join(' ')}`,
        code: `Bearer ${secrets[0]}`,
      }),
      accessJwt: secrets[0],
      refreshJwt: secrets[1],
      appPassword: secrets[2],
      identifier: secrets[3],
      did: secrets[4],
      body: secrets[5],
      headers: { Authorization: `Bearer ${secrets[0]}` },
    } as BlueskyClientError;

    const log = blueskyFailureLogOf(hostile, 502);
    const line = JSON.stringify(log);

    expect(Object.keys(log)).toEqual(['event', 'kind', 'status', 'code', 'operation', 'responseStatus']);
    for (const secret of secrets) expect(line).not.toContain(secret);
    expect(log.code).toBeNull();
    expect(log.operation).toBe('chat.bsky.convo.sendMessage');
  });
});

describe('logBlueskyFailure', () => {
  it('console.warn に JSON の 1 行を出す', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logBlueskyFailure(clientError(), 502);

    expect(warn).toHaveBeenCalledTimes(1);
    const [line] = warn.mock.calls[0] as [string];
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(blueskyFailureLogOf(clientError(), 502));
  });

  it('ログの出力が失敗しても例外を投げない', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => logBlueskyFailure(clientError(), 502)).not.toThrow();
  });
});
