import { Link, Note, Person } from '@fedify/vocab';
import { describe, expect, it, vi } from 'vitest';

import { toRemotePostIdentity } from './remoteNoteIdentity.ts';

const alice = new Person({
  id: new URL('https://remote.example/users/alice'),
  inbox: new URL('https://remote.example/users/alice/inbox'),
  preferredUsername: 'alice',
});

const identityOf = (props: Partial<ConstructorParameters<typeof Note>[0]> = {}) =>
  toRemotePostIdentity(
    new Note({ id: new URL('https://remote.example/users/alice/statuses/1'), attribution: alice, ...props }),
    { origin: 'https://iori.test', documentLoader: vi.fn() as never },
  );

describe('toRemotePostIdentity の url', () => {
  it('Note の url を取り出す', async () => {
    expect((await identityOf({ url: new URL('https://remote.example/@alice/1') }))?.url).toBe(
      'https://remote.example/@alice/1',
    );
  });

  it('Link の href を取り出す', async () => {
    const url = new Link({ href: new URL('https://remote.example/@alice/1') });

    expect((await identityOf({ url }))?.url).toBe('https://remote.example/@alice/1');
  });

  it('url が無いときと、http(s) 以外のときは null にする', async () => {
    expect((await identityOf())?.url).toBeNull();
    expect((await identityOf({ url: new URL('ftp://remote.example/@alice/1') }))?.url).toBeNull();
  });
});
