export type FixtureValue = string | number;
export type FixtureRow = Record<string, FixtureValue>;

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const ids = {
  user: id(1),
  me: id(10),
  a: id(11),
  b: id(12),
  c: id(13),
  d: id(14),
  e: id(15),
  f: id(16),
  myPost: id(20),
  myArticlePost: id(21),
  dPost: id(22),
  fPost: id(23),
  myLikeOnD: id(30),
  cLikeOnMine: id(31),
  fLikeOnF: id(32),
} as const;

export const outOfScopeActors = [ids.f];
export const outOfScopePosts = [ids.fPost];

export const scopeFixtureRows = (timestamp: FixtureValue): Record<string, FixtureRow[]> => {
  const actor = (actorId: string, name: string): FixtureRow => ({
    actorId,
    uri: `https://${name}.example.test/actor`,
    inboxUrl: `https://${name}.example.test/inbox`,
    type: 'Person',
  });
  const remoteActor = (actorId: string, name: string): FixtureRow => ({
    actorId,
    url: `https://${name}.example.test/@${name}`,
    username: name,
  });
  const post = (postId: string, actorId: string, content: string): FixtureRow => ({
    postId,
    actorId,
    content,
    createdAt: timestamp,
    type: 'note',
  });
  const like = (likeId: string, actorId: string, postId: string): FixtureRow => ({
    likeId,
    actorId,
    postId,
    type: 'local',
    createdAt: timestamp,
  });
  const notificationId = id(90);
  return {
    users: [{ userId: ids.user, username: 'kosui' }],
    actors: [
      actor(ids.me, 'me'),
      actor(ids.a, 'a'),
      actor(ids.b, 'b'),
      actor(ids.c, 'c'),
      actor(ids.d, 'd'),
      actor(ids.e, 'e'),
      actor(ids.f, 'f'),
    ],
    instance_actor_keys: [{ keyId: id(40), type: 'RSASSA-PKCS1-v1_5', privateKey: 'private', publicKey: 'public' }],
    domain_events: [{
      eventId: id(41),
      aggregateId: '{}',
      aggregateName: 'post',
      eventName: 'post.created',
      occurredAt: timestamp,
    }],
    relays: [{
      relayId: id(42),
      inboxUrl: 'https://relay.example.test/inbox',
      actorUri: 'https://relay.example.test/actor',
      status: 'accepted',
      createdAt: timestamp,
    }],
    keys: [{ keyId: id(43), userId: ids.user, type: 'RSASSA-PKCS1-v1_5', privateKey: 'private', publicKey: 'public' }],
    user_passwords: [{
      userId: ids.user,
      algorithm: 'argon2id',
      parallelism: 1,
      tagLength: 32,
      memory: 19456,
      passes: 2,
      nonceHex: '00',
      tagHex: '00',
    }],
    sessions: [{ sessionId: id(44), userId: ids.user, expires: timestamp }],
    local_actors: [{ actorId: ids.me, userId: ids.user }],
    remote_actors: [
      remoteActor(ids.a, 'a'),
      remoteActor(ids.b, 'b'),
      remoteActor(ids.c, 'c'),
      remoteActor(ids.d, 'd'),
      remoteActor(ids.e, 'e'),
      remoteActor(ids.f, 'f'),
    ],
    follows: [
      { followerId: ids.me, followingId: ids.a },
      { followerId: ids.b, followingId: ids.me },
      { followerId: ids.f, followingId: ids.a },
    ],
    posts: [
      post(ids.myPost, ids.me, 'mine'),
      post(ids.myArticlePost, ids.me, 'my article'),
      post(ids.dPost, ids.d, 'from d'),
      post(ids.fPost, ids.f, 'from f'),
    ],
    remote_posts: [
      { postId: ids.dPost, uri: 'https://d.example.test/posts/1' },
      { postId: ids.fPost, uri: 'https://f.example.test/posts/1' },
    ],
    local_posts: [
      { postId: ids.myPost, userId: ids.user },
      { postId: ids.myArticlePost, userId: ids.user },
    ],
    likes: [
      like(ids.myLikeOnD, ids.me, ids.dPost),
      like(ids.cLikeOnMine, ids.c, ids.myPost),
      like(ids.fLikeOnF, ids.f, ids.fPost),
    ],
    local_likes: [{ likeId: ids.myLikeOnD }],
    remote_likes: [
      { likeId: ids.cLikeOnMine, likeActivityUri: 'https://c.example.test/likes/1' },
      { likeId: ids.fLikeOnF, likeActivityUri: 'https://f.example.test/likes/1' },
    ],
    post_images: [
      { imageId: id(50), postId: ids.myPost, url: '/uploads/mine.webp', createdAt: timestamp },
      { imageId: id(51), postId: ids.fPost, url: 'https://f.example.test/media/1.png', createdAt: timestamp },
    ],
    notifications: [{ notificationId, recipientUserId: ids.user, type: 'like', createdAt: timestamp }],
    notification_likes: [{ notificationId, likerActorId: ids.c, likedPostId: ids.myPost }],
    notification_follows: [{ notificationId, followerActorId: ids.b }],
    notification_emoji_reacts: [{
      notificationId,
      reactorActorId: ids.c,
      reactedPostId: ids.myPost,
      emoji: ':a:',
    }],
    notification_replies: [{
      notificationId,
      replierActorId: ids.c,
      replyPostId: ids.dPost,
      originalPostId: ids.myPost,
    }],
    push_subscriptions: [{
      subscriptionId: id(52),
      userId: ids.user,
      endpoint: 'https://push.example.test/1',
      p256dhKey: 'p256dh',
      authKey: 'auth',
      createdAt: timestamp,
    }],
    reposts: [{ repostId: id(53), actorId: ids.me, postId: ids.dPost, createdAt: timestamp }],
    timeline_items: [{
      timelineItemId: id(54),
      type: 'post',
      actorId: ids.me,
      postId: ids.myPost,
      createdAt: timestamp,
    }],
    emoji_reacts: [
      { emojiReactId: id(55), actorId: ids.me, postId: ids.dPost, emoji: ':me:', createdAt: timestamp },
      { emojiReactId: id(56), actorId: ids.c, postId: ids.myPost, emoji: ':c:', createdAt: timestamp },
      { emojiReactId: id(57), actorId: ids.f, postId: ids.fPost, emoji: ':f:', createdAt: timestamp },
    ],
    mutes: [{ muteId: id(58), userId: ids.user, mutedActorId: ids.e, createdAt: timestamp }],
    articles: [{
      articleId: id(59),
      authorActorId: ids.me,
      authorUserId: ids.user,
      rootPostId: ids.myArticlePost,
      title: 'article',
      status: 'published',
      createdAt: timestamp,
    }],
    link_previews: [
      { linkPreviewId: id(60), postId: ids.myPost, url: 'https://mine.example.test/', createdAt: timestamp },
      { linkPreviewId: id(61), postId: ids.fPost, url: 'https://f.example.test/', createdAt: timestamp },
    ],
    federated_timeline_items: [{
      federatedTimelineItemId: id(62),
      postId: ids.fPost,
      relayId: id(42),
      receivedAt: timestamp,
    }],
  };
};

export const exportedRowCounts: Readonly<Record<string, number>> = Object.freeze({
  actors: 6,
  remote_actors: 5,
  follows: 2,
  posts: 3,
  remote_posts: 1,
  likes: 2,
  local_likes: 1,
  remote_likes: 1,
  post_images: 1,
  emoji_reacts: 2,
  link_previews: 1,
  domain_events: 0,
  notifications: 0,
  notification_likes: 0,
  notification_follows: 0,
  notification_emoji_reacts: 0,
  notification_replies: 0,
  timeline_items: 0,
  federated_timeline_items: 0,
  reposts: 0,
  sessions: 0,
});

export const insertStatement = (table: string, row: FixtureRow, placeholder: (index: number) => string) => {
  const columns = Object.keys(row);
  return {
    sql: `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${
      columns.map((_, index) => placeholder(index + 1)).join(', ')
    })`,
    values: columns.map(column => row[column]!),
  };
};
