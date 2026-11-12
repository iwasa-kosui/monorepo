import type { Block } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';
import { createOnBlock } from './onBlock.ts';

const blockerUri = 'https://remote.example/users/alice';
const objectUri = 'https://iori.example/users/bob';

const setup = (parsed: unknown = { type: 'actor', identifier: 'bob' }) => {
  const run = vi.fn(async () => RA.ok(undefined));
  const ctx = { parseUri: vi.fn(() => parsed) } as never;
  const activity = (overrides: Record<string, unknown> = {}) =>
    ({ actorId: new URL(blockerUri), objectId: new URL(objectUri), ...overrides }) as unknown as Block;
  const onBlock = createOnBlock({ acceptBlockUseCase: { run } as never });
  return { run, ctx, activity, onBlock };
};

describe('createOnBlock', () => {
  it('受信ユーザーと送信者の間のフォローを消す use case を呼ぶ', async () => {
    const { run, ctx, activity, onBlock } = setup();

    await onBlock(ctx, activity());

    expect(run).toHaveBeenCalledWith({ username: 'bob', blocker: { uri: blockerUri } });
  });

  it('actor か object がない Block は何もしない', async () => {
    const { run, ctx, activity, onBlock } = setup();

    await onBlock(ctx, activity({ actorId: null }));
    await onBlock(ctx, activity({ objectId: null }));

    expect(run).not.toHaveBeenCalled();
  });

  it('object がユーザーのアクターでなければ何もしない', async () => {
    const note = setup({ type: 'object', class: 'Note' });
    const instance = setup({ type: 'actor', identifier: INSTANCE_ACTOR_IDENTIFIER });

    await note.onBlock(note.ctx, note.activity());
    await instance.onBlock(instance.ctx, instance.activity());

    expect(note.run).not.toHaveBeenCalled();
    expect(instance.run).not.toHaveBeenCalled();
  });

  it('use case が失敗しても例外を投げない', async () => {
    const { run, ctx, activity, onBlock } = setup();
    run.mockResolvedValueOnce(RA.err(new Error('User not found')) as never);

    await expect(onBlock(ctx, activity())).resolves.toBeUndefined();
  });
});
