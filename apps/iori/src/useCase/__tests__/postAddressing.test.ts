import { PUBLIC_COLLECTION } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { toPostAddressing } from '../helper/postAddressing.ts';

const followersUri = new URL('https://iori.test/users/kosui/followers');
const alice = new URL('https://remote.example/users/alice');
const bob = new URL('https://remote.example/users/bob');

const href = (uris: ReadonlyArray<URL>) => uris.map((uri) => uri.href);

describe('toPostAddressing', () => {
  it('public は to に Public、cc に followers とメンションを入れる', () => {
    const { tos, ccs } = toPostAddressing({ visibility: 'public', followersUri, mentionUris: [alice, bob] });
    expect(href(tos)).toEqual([PUBLIC_COLLECTION.href]);
    expect(href(ccs)).toEqual([followersUri.href, alice.href, bob.href]);
  });

  it('unlisted は to に followers、cc に Public とメンションを入れる', () => {
    const { tos, ccs } = toPostAddressing({ visibility: 'unlisted', followersUri, mentionUris: [alice] });
    expect(href(tos)).toEqual([followersUri.href]);
    expect(href(ccs)).toEqual([PUBLIC_COLLECTION.href, alice.href]);
  });

  it('private は to に followers、cc にメンションだけを入れ、Public を含めない', () => {
    const { tos, ccs } = toPostAddressing({ visibility: 'private', followersUri, mentionUris: [alice] });
    expect(href(tos)).toEqual([followersUri.href]);
    expect(href(ccs)).toEqual([alice.href]);
    expect(href([...tos, ...ccs])).not.toContain(PUBLIC_COLLECTION.href);
  });

  it('direct は to にメンションだけを入れ、cc は空にする', () => {
    const { tos, ccs } = toPostAddressing({ visibility: 'direct', followersUri, mentionUris: [alice, bob] });
    expect(href(tos)).toEqual([alice.href, bob.href]);
    expect(ccs).toEqual([]);
  });
});
