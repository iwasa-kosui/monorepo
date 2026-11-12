import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { createD1ThreadResolver } from '../post/threadResolver.ts';
import { createMastodonSeed, SEED_ORIGIN } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const resolve = async (
    postId: string,
    options: { currentActorId?: string; onlyVisibleToViewer?: boolean } = {},
  ) => {
    const result = await createD1ThreadResolver(fixture.db, SEED_ORIGIN).resolve({
      postId: PostId.orThrow(postId),
      currentActorId: options.currentActorId === undefined ? undefined : ActorId.orThrow(options.currentActorId),
      onlyVisibleToViewer: options.onlyVisibleToViewer,
    });
    if (!result.ok) throw new Error('resolve failed');
    return {
      currentPost: result.val.currentPost?.postId,
      ancestors: result.val.ancestors.map((post) => post.postId),
      descendants: result.val.descendants.map((post) => post.postId),
    };
  };
  return { ...fixture, seed, resolve };
};

const idsOf = (posts: ReadonlyArray<{ postId: string }>) => posts.map((post) => post.postId);

describe('createD1ThreadResolver の祖先', () => {
  it('40 段を超える鎖では、起点に近い 40 件を根に近い順で返す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const chain = [t.seed.addLocalPost(me, 1_000)];
    for (let n = 1; n <= 45; n++) chain.push(t.seed.addLocalPost(me, 1_000 + n, { inReplyToUri: chain[n - 1].uri }));

    const result = await t.resolve(chain[45].postId);

    expect(result.ancestors).toEqual(idsOf(chain.slice(5, 45)));
  });

  it('リモートとローカルが混ざった鎖でも根から順に返す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addRemotePost(alice, 1_000);
    const a = t.seed.addLocalPost(me, 2_000, { inReplyToUri: root.uri });
    const b = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: a.uri });
    const c = t.seed.addLocalPost(me, 4_000, { inReplyToUri: b.uri });

    const result = await t.resolve(c.postId);

    expect(result.ancestors).toEqual([root.postId, a.postId, b.postId]);
  });

  it('親が削除済みなら、そこで止まる', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addLocalPost(me, 1_000);
    const deletedLocal = t.seed.addLocalPost(me, 2_000, { inReplyToUri: root.uri, deletedAt: 2_500 });
    const afterLocal = t.seed.addLocalPost(me, 3_000, { inReplyToUri: deletedLocal.uri });
    const remoteRoot = t.seed.addRemotePost(alice, 4_000);
    const afterRemote = t.seed.addLocalPost(me, 5_000, { inReplyToUri: remoteRoot.uri });
    t.sqlite.prepare('UPDATE posts SET deletedAt = ? WHERE postId = ?').run(5_500, remoteRoot.postId);

    const local = await t.resolve(afterLocal.postId);
    const remote = await t.resolve(afterRemote.postId);

    expect(local.ancestors).toEqual([]);
    expect(remote.ancestors).toEqual([]);
  });

  it('親が取得されていなければ、そこで止まり、途中の祖先は残る', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const top = t.seed.addRemotePost(alice, 1_000, { inReplyToUri: 'https://remote.example/notes/not-fetched' });
    const mid = t.seed.addLocalPost(me, 2_000, { inReplyToUri: top.uri });
    const missingLocal = t.seed.addLocalPost(me, 3_000, {
      inReplyToUri: `${SEED_ORIGIN}/users/kosui/posts/00000000-0000-4000-8000-ffffffffffff`,
    });
    const leaf = t.seed.addLocalPost(me, 4_000, { inReplyToUri: mid.uri });
    const orphan = t.seed.addLocalPost(me, 5_000, { inReplyToUri: missingLocal.uri });

    const result = await t.resolve(leaf.postId);
    const missing = await t.resolve(orphan.postId);

    expect(result.ancestors).toEqual([top.postId, mid.postId]);
    expect(missing.ancestors).toEqual([missingLocal.postId]);
  });

  it('inReplyTo が循環していても止まり、自分自身は祖先に入れない', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const a = t.seed.addLocalPost(me, 1_000);
    const b = t.seed.addLocalPost(me, 2_000, { inReplyToUri: a.uri });
    const c = t.seed.addLocalPost(me, 3_000, { inReplyToUri: b.uri });
    t.sqlite.prepare('UPDATE local_posts SET inReplyToUri = ? WHERE postId = ?').run(c.uri, a.postId);
    const selfReply = t.seed.addLocalPost(me, 4_000);
    t.sqlite.prepare('UPDATE local_posts SET inReplyToUri = ? WHERE postId = ?').run(selfReply.uri, selfReply.postId);

    const cycle = await t.resolve(a.postId);
    const self = await t.resolve(selfReply.postId);

    expect(cycle.ancestors).toEqual([b.postId, c.postId]);
    expect(cycle.descendants).toEqual([b.postId, c.postId]);
    expect(self.ancestors).toEqual([]);
    expect(self.descendants).toEqual([]);
  });

  it('返信先の URI が別の書き方でも、ローカルの投稿をたどる', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const dotted = t.seed.addLocalActor('ko.sui');
    const root = t.seed.addLocalPost(me, 1_000);
    const viaDot = t.seed.addLocalPost(dotted, 2_000, { inReplyToUri: root.uri });
    const viaOtherName = t.seed.addLocalPost(me, 3_000, { inReplyToUri: viaDot.uri });
    const viaQuery = t.seed.addLocalPost(me, 4_000, {
      inReplyToUri: `${SEED_ORIGIN}/users/someone/posts/${viaOtherName.postId}`,
    });
    const viaHost = t.seed.addLocalPost(me, 5_000, { inReplyToUri: `${viaQuery.uri}?ref=1` });
    const leaf = t.seed.addLocalPost(me, 6_000, {
      inReplyToUri: viaHost.uri.replace('https://iori.test', 'https://IORI.TEST:443'),
    });

    const result = await t.resolve(leaf.postId);

    expect(result.ancestors).toEqual([root, viaDot, viaOtherName, viaQuery, viaHost].map((post) => post.postId));
  });

  it('リモートの投稿の返信先がローカルの URI でも、そのローカルの投稿をたどる', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const mine = t.seed.addLocalPost(me, 1_000);
    const reply = t.seed.addRemotePost(alice, 2_000, { inReplyToUri: mine.uri });
    const leaf = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: reply.uri });

    const result = await t.resolve(leaf.postId);

    expect(result.ancestors).toEqual([mine.postId, reply.postId]);
  });
});

describe('createD1ThreadResolver の子孫', () => {
  it('20 段を超える鎖では、起点に近い 20 件を親子の順で返す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const chain = [t.seed.addLocalPost(me, 1_000)];
    for (let n = 1; n <= 25; n++) chain.push(t.seed.addLocalPost(me, 1_000 + n, { inReplyToUri: chain[n - 1].uri }));

    const result = await t.resolve(chain[0].postId);

    expect(result.descendants).toEqual(idsOf(chain.slice(1, 21)));
  });

  it('60 件を超える兄弟では、古い順（同時刻は postId 順）の先頭 60 件を返す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const root = t.seed.addLocalPost(me, 1_000);
    const replies = [];
    for (let n = 1; n <= 70; n++) {
      replies.push(t.seed.addLocalPost(me, 2_000 + Math.floor(n / 3), { inReplyToUri: root.uri }));
    }

    const result = await t.resolve(root.postId);

    expect(result.descendants).toEqual(idsOf(replies.slice(0, 60)));
  });

  it('60 件の上限が段の途中で来たら、その段は全体の古い順で切り、並びは親子の深さ優先にする', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const root = t.seed.addLocalPost(me, 1_000);
    const parents = [1, 2, 3].map((n) => t.seed.addLocalPost(me, 2_000 + n, { inReplyToUri: root.uri }));
    const grandchildren: ReturnType<typeof t.seed.addLocalPost>[][] = [[], [], []];
    for (let j = 1; j <= 25; j++) {
      parents.forEach((parent, i) => {
        grandchildren[i].push(t.seed.addLocalPost(me, 3_000 + j, { inReplyToUri: parent.uri }));
      });
    }
    t.seed.addLocalPost(me, 9_000, { inReplyToUri: grandchildren[0][0].uri });

    const result = await t.resolve(root.postId);

    expect(result.descendants).toEqual(
      parents.flatMap((parent, i) => [parent.postId, ...idsOf(grandchildren[i].slice(0, 19))]),
    );
  });

  it('深い鎖と幅のある段が混ざっても、段ごとに親子の深さ優先で並べる', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addRemotePost(alice, 1_000);
    const late = t.seed.addLocalPost(me, 5_000, { inReplyToUri: root.uri });
    const early = t.seed.addRemotePost(alice, 2_000, { inReplyToUri: root.uri });
    const lateChild = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: late.uri });
    const earlyChild = t.seed.addLocalPost(me, 6_000, { inReplyToUri: early.uri });
    const earlyGrandchild = t.seed.addLocalPost(me, 7_000, { inReplyToUri: earlyChild.uri });
    t.seed.addLocalPost(me, 8_000, { inReplyToUri: root.uri, deletedAt: 8_500 });

    const result = await t.resolve(root.postId);

    expect(result.descendants).toEqual([
      early.postId,
      earlyChild.postId,
      earlyGrandchild.postId,
      late.postId,
      lateChild.postId,
    ]);
  });

  it('子孫の途中が削除済みなら、その下は返さない', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const root = t.seed.addLocalPost(me, 1_000);
    const kept = t.seed.addLocalPost(me, 2_000, { inReplyToUri: root.uri });
    const removed = t.seed.addLocalPost(me, 3_000, { inReplyToUri: root.uri, deletedAt: 3_500 });
    t.seed.addLocalPost(me, 4_000, { inReplyToUri: removed.uri });

    const result = await t.resolve(root.postId);

    expect(result.descendants).toEqual([kept.postId]);
  });

  it('起点を子孫の返信先にする循環があっても、起点を子孫に入れず、起点の枠は 60 件に数える', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const root = t.seed.addLocalPost(me, 1_000);
    const child = t.seed.addLocalPost(me, 2_000, { inReplyToUri: root.uri });
    t.sqlite.prepare('UPDATE local_posts SET inReplyToUri = ? WHERE postId = ?').run(child.uri, root.postId);
    const grandchildren = [];
    for (let n = 1; n <= 70; n++) grandchildren.push(t.seed.addLocalPost(me, 3_000 + n, { inReplyToUri: child.uri }));
    const deep = t.seed.addLocalPost(me, 9_000, { inReplyToUri: grandchildren[0].uri });

    const result = await t.resolve(root.postId);

    expect(result.descendants).toEqual([
      child.postId,
      grandchildren[0].postId,
      deep.postId,
      ...idsOf(grandchildren.slice(1, 58)),
    ]);
    expect(result.ancestors).toEqual([child.postId]);
  });
});

describe('createD1ThreadResolver の閲覧者による絞り込み', () => {
  it('見えない祖先は除くが、その先の祖先はたどる', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const hidden = t.seed.addRemotePost(alice, 2_000, { inReplyToUri: root.uri, visibility: 'private' });
    const visible = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: hidden.uri, visibility: 'unlisted' });
    const current = t.seed.addLocalPost(me, 4_000, { inReplyToUri: visible.uri });

    const filtered = await t.resolve(current.postId, { currentActorId: me.actorId, onlyVisibleToViewer: true });
    const unfiltered = await t.resolve(current.postId, { currentActorId: me.actorId });

    expect(filtered.ancestors).toEqual([root.postId, visible.postId]);
    expect(unfiltered.ancestors).toEqual([root.postId, hidden.postId, visible.postId]);
  });

  it('見えない子孫は除くが、その下の子孫は残し、見えない子孫も 60 件の枠を使う', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addLocalPost(me, 1_000);
    const replies = [];
    for (let n = 1; n <= 70; n++) {
      replies.push(
        t.seed.addRemotePost(alice, 2_000 + n, {
          inReplyToUri: root.uri,
          visibility: n % 10 === 0 ? 'private' : 'public',
        }),
      );
    }
    const underHidden = t.seed.addLocalPost(me, 9_000, { inReplyToUri: replies[9].uri });

    const filtered = await t.resolve(root.postId, { currentActorId: me.actorId, onlyVisibleToViewer: true });
    const unfiltered = await t.resolve(root.postId, { currentActorId: me.actorId });

    expect(filtered.descendants).toEqual(idsOf(replies.slice(0, 60).filter((_, index) => (index + 1) % 10 !== 0)));
    expect(unfiltered.descendants).toEqual(idsOf(replies.slice(0, 60)));
    expect(unfiltered.descendants).not.toContain(underHidden.postId);
  });

  it('見えない投稿の下の子孫は、上限に収まれば残す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addLocalPost(me, 1_000);
    const hidden = t.seed.addRemotePost(alice, 2_000, { inReplyToUri: root.uri, visibility: 'private' });
    const under = t.seed.addLocalPost(me, 3_000, { inReplyToUri: hidden.uri });

    const result = await t.resolve(root.postId, { currentActorId: me.actorId, onlyVisibleToViewer: true });

    expect(result.descendants).toEqual([under.postId]);
  });

  it('起点が見えなければ、何も返さない。フォローしていれば返す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const hiddenRoot = t.seed.addRemotePost(alice, 1_000, { visibility: 'private' });
    const reply = t.seed.addLocalPost(me, 2_000, { inReplyToUri: hiddenRoot.uri });

    const hidden = await t.resolve(hiddenRoot.postId, { currentActorId: me.actorId, onlyVisibleToViewer: true });
    t.seed.addFollow(me.actorId, alice.actorId);
    const followed = await t.resolve(hiddenRoot.postId, { currentActorId: me.actorId, onlyVisibleToViewer: true });

    expect(hidden).toEqual({ currentPost: undefined, ancestors: [], descendants: [] });
    expect(followed).toEqual({ currentPost: hiddenRoot.postId, ancestors: [], descendants: [reply.postId] });
  });
});

describe('createD1ThreadResolver の D1 の呼び出し回数', () => {
  const countQueries = async (build: (t: ReturnType<typeof setup>) => string): Promise<number> => {
    const t = setup();
    const postId = build(t);
    t.queries.length = 0;
    await t.resolve(postId);
    return t.queries.length;
  };

  const ancestorChain = (depth: number, kind: 'local' | 'remote') => (t: ReturnType<typeof setup>) => {
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const add = (createdAt: number, inReplyToUri?: string) =>
      kind === 'local'
        ? t.seed.addLocalPost(me, createdAt, { inReplyToUri })
        : t.seed.addRemotePost(alice, createdAt, { inReplyToUri });
    let post = add(1_000);
    for (let n = 1; n <= depth; n++) post = add(1_000 + n, post.uri);
    return post.postId;
  };

  const descendantChain = (depth: number) => (t: ReturnType<typeof setup>) => {
    const me = t.seed.addLocalActor('kosui');
    const root = t.seed.addLocalPost(me, 1_000);
    let post = root;
    for (let n = 1; n <= depth; n++) post = t.seed.addLocalPost(me, 1_000 + n, { inReplyToUri: post.uri });
    return root.postId;
  };

  it('祖先の段数が増えても、呼び出し回数は増えない', async () => {
    const shallow = await countQueries(ancestorChain(2, 'local'));
    const deep = await countQueries(ancestorChain(30, 'local'));
    const shallowRemote = await countQueries(ancestorChain(2, 'remote'));
    const deepRemote = await countQueries(ancestorChain(30, 'remote'));

    expect(deep).toBe(shallow);
    expect(deepRemote).toBe(shallowRemote);
    expect(deep).toBeLessThanOrEqual(10);
  });

  it('子孫の段数が増えても、呼び出し回数は増えない', async () => {
    const shallow = await countQueries(descendantChain(2));
    const deep = await countQueries(descendantChain(20));

    expect(deep).toBe(shallow);
    expect(deep).toBeLessThanOrEqual(10);
  });

  it('祖先と子孫の取得は、それぞれ再帰 CTE を 1 回だけ流し、SELECT で始まる', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const root = t.seed.addLocalPost(me, 1_000);
    const mid = t.seed.addLocalPost(me, 2_000, { inReplyToUri: root.uri });
    t.seed.addLocalPost(me, 3_000, { inReplyToUri: mid.uri });
    t.queries.length = 0;

    await t.resolve(mid.postId);

    const recursive = t.queries.filter((query) => /with recursive/i.test(query.sql));
    expect(recursive).toHaveLength(2);
    expect(recursive.every((query) => /^select\b/i.test(query.sql))).toBe(true);
  });
});
