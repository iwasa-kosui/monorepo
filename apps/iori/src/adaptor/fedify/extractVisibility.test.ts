import { Create, Note, Person } from '@fedify/fedify';
import { describe, expect, it } from 'vitest';

import { extractVisibility } from './extractVisibility.ts';

const publicUri = new URL('https://www.w3.org/ns/activitystreams#Public');
const followersId = new URL('https://remote.example/users/alice/followers');
const bobId = new URL('https://remote.example/users/bob');
const noteId = new URL('https://remote.example/notes/1');

describe('extractVisibility', () => {
  it('reads to and cc of a Note', () => {
    expect(extractVisibility(new Note({ id: noteId, tos: [publicUri], ccs: [followersId] }), followersId)).toBe(
      'public',
    );
    expect(extractVisibility(new Note({ id: noteId, tos: [followersId], ccs: [publicUri] }), followersId)).toBe(
      'unlisted',
    );
    expect(extractVisibility(new Note({ id: noteId, tos: [followersId] }), followersId)).toBe('private');
    expect(extractVisibility(new Note({ id: noteId, tos: [bobId] }), followersId)).toBe('direct');
  });

  it('reads to and cc of a Create', () => {
    const create = new Create({ id: new URL('https://remote.example/activities/1'), tos: [publicUri] });
    expect(extractVisibility(create, followersId)).toBe('public');
  });

  it('returns null when neither to nor cc is present', () => {
    expect(extractVisibility(new Note({ id: noteId }), followersId)).toBeNull();
  });

  it('treats the followers collection as unknown when the author has none', () => {
    const author = new Person({ id: new URL('https://remote.example/users/alice') });
    expect(extractVisibility(new Note({ id: noteId, tos: [followersId] }), author.followersId)).toBe('direct');
  });
});
