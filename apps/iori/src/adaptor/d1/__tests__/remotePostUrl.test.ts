import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostResolver } from '../post/postResolver.ts';
import { createD1PostResolverByUri } from '../post/postResolverByUri.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const alice = createMastodonSeed(fixture).addRemoteActor('alice');
  const store = async (url: string | null | undefined) => {
    const event = Post.createRemotePost(Instant.orThrow(1_000))({
      content: '<p>hi</p>',
      uri: 'https://remote.example/users/alice/statuses/1',
      ...(url === undefined ? {} : { url }),
      actorId: alice.actorId as ActorId,
      visibility: 'public',
    });
    await createD1PostCreatedStore(fixture.db).store(event);
    return event.aggregateState;
  };
  return { fixture, store };
};

describe('リモートの投稿の url の保存', () => {
  it('url を remote_posts に保存し、uri と postId のどちらで引いても読み出せる', async () => {
    const t = setup();

    const post = await t.store('https://remote.example/@alice/1');

    expect(t.fixture.sqlite.prepare('SELECT url FROM remote_posts WHERE postId = ?').get(post.postId)).toEqual({
      url: 'https://remote.example/@alice/1',
    });
    const byUri = Result.unsafeUnwrap(await createD1PostResolverByUri(t.fixture.db).resolve({ uri: post.uri }));
    expect(byUri?.url).toBe('https://remote.example/@alice/1');
    const byId = Result.unsafeUnwrap(await createD1PostResolver(t.fixture.db).resolve(post.postId));
    expect(byId).toMatchObject({ type: 'remote', url: 'https://remote.example/@alice/1' });
  });

  it.each([null, undefined])('url が %s なら NULL で保存し、null として読み出す', async (url) => {
    const t = setup();

    const post = await t.store(url);

    expect(t.fixture.sqlite.prepare('SELECT url FROM remote_posts WHERE postId = ?').get(post.postId)).toEqual({
      url: null,
    });
    const byUri = Result.unsafeUnwrap(await createD1PostResolverByUri(t.fixture.db).resolve({ uri: post.uri }));
    expect(byUri?.url).toBeNull();
  });
});
