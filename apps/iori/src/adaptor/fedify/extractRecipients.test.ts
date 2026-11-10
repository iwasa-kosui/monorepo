import { Create, Note } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { extractRecipientActorUris } from './extractRecipients.ts';

const origin = 'https://iori.test';
const publicUri = new URL('https://www.w3.org/ns/activitystreams#Public');
const noteId = new URL('https://remote.example/notes/1');
const kosui = 'https://iori.test/users/kosui';
const hanako = 'https://iori.test/users/hanako';

describe('extractRecipientActorUris', () => {
  it('keeps the local actors in to and cc', () => {
    const note = new Note({ id: noteId, tos: [new URL(kosui)], ccs: [new URL(hanako)] });

    expect(extractRecipientActorUris([note], origin)).toEqual([kosui, hanako]);
  });

  it('keeps the local actors in bto, bcc and audience', () => {
    const note = new Note({
      id: noteId,
      btos: [new URL(kosui)],
      bccs: [new URL(hanako)],
      audience: new Note({ id: new URL('https://iori.test/users/taro') }),
    });

    expect(extractRecipientActorUris([note], origin)).toEqual([kosui, hanako, 'https://iori.test/users/taro']);
  });

  it('drops as:Public, collections and actors of other origins', () => {
    const note = new Note({
      id: noteId,
      tos: [
        publicUri,
        new URL('https://remote.example/users/bob'),
        new URL('https://iori.test/users/kosui/followers'),
        new URL('https://iori.test/inbox'),
        new URL('https://other.test/users/kosui'),
        new URL(kosui),
      ],
    });

    expect(extractRecipientActorUris([note], origin)).toEqual([kosui]);
  });

  it('unions several addressed objects without duplicates', () => {
    const note = new Note({ id: noteId, tos: [new URL(kosui)] });
    const create = new Create({
      id: new URL('https://remote.example/activities/1'),
      tos: [new URL(kosui)],
      ccs: [new URL(hanako)],
    });

    expect(extractRecipientActorUris([note, create], origin)).toEqual([kosui, hanako]);
  });

  it('returns an empty list when nothing is addressed', () => {
    expect(extractRecipientActorUris([new Note({ id: noteId })], origin)).toEqual([]);
  });
});
