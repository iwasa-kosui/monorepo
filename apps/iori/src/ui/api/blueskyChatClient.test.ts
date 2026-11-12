import { describe, expect, it } from 'vitest';

import { isBlueskyChatApiError, toBlueskyChatApiError } from './blueskyChatClient.ts';

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('toBlueskyChatApiError', () => {
  it('ステータス、error、reason を取り出す', async () => {
    const error = await toBlueskyChatApiError(
      jsonResponse({ error: 'Validation failed: text', reason: 'too_many_graphemes' }, 422),
    );

    expect(isBlueskyChatApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 422, code: 'Validation failed: text', reason: 'too_many_graphemes' });
  });

  it('本文が JSON でなければステータスだけを持つ', async () => {
    const error = await toBlueskyChatApiError(new Response('bad gateway', { status: 502 }));

    expect(error).toMatchObject({ status: 502, code: undefined, reason: undefined });
    expect(error.message).toBe('HTTP 502');
  });
});
