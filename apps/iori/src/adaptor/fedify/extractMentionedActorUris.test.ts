import { Hashtag, Mention, Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { extractMentionedActorUris } from './extractMentionedActorUris.ts';

const noteId = new URL('https://remote.example/notes/1');
const alice = 'https://remote.example/users/alice';
const kosui = 'https://iori.test/users/kosui';

describe('extractMentionedActorUris', () => {
  it('Mention タグの href を返し、同じ href は 1 つにまとめる', async () => {
    const note = new Note({
      id: noteId,
      tags: [
        new Mention({ href: new URL(alice) }),
        new Mention({ href: new URL(kosui) }),
        new Mention({
          href: new URL(alice),
        }),
      ],
    });

    expect(await extractMentionedActorUris(note)).toEqual([alice, kosui]);
  });

  it('Mention 以外のタグと as:Public の Mention は含めない', async () => {
    const note = new Note({
      id: noteId,
      tags: [
        new Hashtag({ name: '#tag', href: new URL('https://remote.example/tags/tag') }),
        new Mention({
          href: PUBLIC_COLLECTION,
        }),
      ],
    });

    expect(await extractMentionedActorUris(note)).toEqual([]);
  });

  it('タグが無ければ空にする', async () => {
    expect(await extractMentionedActorUris(new Note({ id: noteId }))).toEqual([]);
  });
});
