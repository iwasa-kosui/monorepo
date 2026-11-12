import { Note, Person } from '@fedify/vocab';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FetchReplyNotesRecursiveUseCase } from '../../../useCase/fetchReplyNotesRecursive.ts';
import { createD1ActorResolverByUri } from '../actor/actorResolverByUri.ts';
import { createD1LogoUriUpdatedStore } from '../actor/logoUriUpdatedStore.ts';
import { createD1RemoteActorCreatedStore } from '../actor/remoteActorCreatedStore.ts';
import { createD1PostImageCreatedStore } from '../image/postImageCreatedStore.ts';
import { createD1LocalPostResolverByUri } from '../post/localPostResolverByUri.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostResolverByUri } from '../post/postResolverByUri.ts';
import { createD1RemotePostUpserter } from '../post/remotePostUpserter.ts';
import { createMastodonSeed, SEED_ORIGIN } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const quotedUri = 'https://other.example/notes/quoted';
const quotedAuthor = new Person({
  id: new URL('https://other.example/users/bob'),
  inbox: new URL('https://other.example/users/bob/inbox'),
  preferredUsername: 'bob',
});
const quotedNote = new Note({
  id: new URL(quotedUri),
  content: '<p>quoted</p>',
  attribution: quotedAuthor,
  tos: [new URL('https://www.w3.org/ns/activitystreams#Public')],
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db } = fixture;
  const postResolverByUri = createD1PostResolverByUri(db);
  const useCase = FetchReplyNotesRecursiveUseCase.create({
    origin: SEED_ORIGIN,
    postResolverByUri,
    localPostResolverByUri: createD1LocalPostResolverByUri(db, SEED_ORIGIN),
    remotePostUpserter: createD1RemotePostUpserter({
      postResolverByUri,
      postCreatedStore: createD1PostCreatedStore(db),
      postImageCreatedStore: createD1PostImageCreatedStore(db),
      remoteActorCreatedStore: createD1RemoteActorCreatedStore(db),
      logoUriUpdatedStore: createD1LogoUriUpdatedStore(db),
      actorResolverByUri: createD1ActorResolverByUri(db),
    }),
    isBlockedUri: () => false,
  });
  const fetchQuoted = (lookupObject: (uri: string) => Promise<unknown>) =>
    useCase.run({
      inReplyToUri: quotedUri,
      documentLoader: vi.fn() as never,
      lookupObject: (uri) => lookupObject(uri),
      maxDepth: 1,
    });
  const remotePostUris = () =>
    (fixture.sqlite.prepare('SELECT uri FROM remote_posts').all() as { uri: string }[]).map((row) => row.uri);
  return { ...fixture, seed: createMastodonSeed(fixture), fetchQuoted, remotePostUris };
};

describe('引用先の取得と保存', () => {
  it('引用先が D1 に無ければ取得して remote_posts に保存する', async () => {
    const t = setup();
    const lookupObject = vi.fn(async () => quotedNote);

    const result = await t.fetchQuoted(lookupObject);

    expect(lookupObject).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, val: { fetchedPosts: [{ uri: quotedUri }] } });
    expect(t.remotePostUris()).toEqual([quotedUri]);
  });

  it('引用先が remote_posts に既にあれば取得しない', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    t.sqlite.prepare('UPDATE remote_posts SET uri = ? WHERE postId = ?').run(
      quotedUri,
      t.seed.addRemotePost(alice, 1_000).postId,
    );
    const lookupObject = vi.fn(async () => quotedNote);

    await t.fetchQuoted(lookupObject);

    expect(lookupObject).not.toHaveBeenCalled();
    expect(t.remotePostUris()).toEqual([quotedUri]);
  });

  it('取得に失敗しても例外にせず、何も保存しない', async () => {
    const t = setup();

    const result = await t.fetchQuoted(async () => {
      throw new Error('lookup failed');
    });

    expect(result).toMatchObject({ ok: true, val: { fetchedPosts: [] } });
    expect(t.remotePostUris()).toEqual([]);
  });

  it('取得した引用先が返信先や引用を持っていても、辿らずに引用先の URI だけ保存する', async () => {
    const t = setup();
    const lookupObject = vi.fn(async () =>
      quotedNote.clone({
        replyTarget: new URL('https://other.example/notes/parent'),
        quote: new URL('https://other.example/notes/quoted-quote'),
      })
    );

    await t.fetchQuoted(lookupObject);

    expect(lookupObject).toHaveBeenCalledOnce();
    expect(t.remotePostUris()).toEqual([quotedUri]);
    expect(t.sqlite.prepare('SELECT quoteUri FROM post_quotes').all()).toEqual([
      { quoteUri: 'https://other.example/notes/quoted-quote' },
    ]);
  });
});
