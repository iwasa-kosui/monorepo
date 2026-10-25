import { Create, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createOnCreate } from './onCreate.ts';

describe('createOnCreate', () => {
  it('awaits recursive reply fetching before resolving', async () => {
    let finishFetch: ((value: unknown) => void) | undefined;
    const fetchReplyNotesRecursiveUseCase = {
      run: vi.fn(() =>
        new Promise((resolve) => {
          finishFetch = resolve;
        })
      ),
    };
    const note = new Note({
      id: new URL('https://remote.example/posts/reply'),
      content: '<p>reply</p>',
      replyTarget: new URL('https://remote.example/posts/parent'),
    });
    const activity = {
      getObject: vi.fn(async () => note),
    } as unknown as Create;
    const listener = createOnCreate({
      inboxActorResolver: {
        resolve: async () =>
          RA.ok({
            actorIdentity: {} as never,
            documentLoaderOptions: { documentLoader: vi.fn() as never },
          }),
      } as never,
      addRemotePostUseCase: {
        run: async () => RA.ok({ actor: { uri: 'https://remote.example/users/alice' } } as never),
      },
      fetchReplyNotesRecursiveUseCase: fetchReplyNotesRecursiveUseCase as never,
    });

    let settled = false;
    const processing = listener({ lookupObject: vi.fn() } as never, activity).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(fetchReplyNotesRecursiveUseCase.run).toHaveBeenCalledOnce());
    expect(settled).toBe(false);

    finishFetch?.(RA.ok({ fetchedPosts: [] }));
    await processing;
    expect(settled).toBe(true);
  });
});
