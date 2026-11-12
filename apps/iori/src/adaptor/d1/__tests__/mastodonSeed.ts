import type { createSqliteD1Fixture } from './sqliteFixture.ts';

export const SEED_ORIGIN = 'https://iori.test';

type Fixture = ReturnType<typeof createSqliteD1Fixture>;

export const createMastodonSeed = ({ sqlite }: Fixture) => {
  let counter = 0;
  const uuid = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

  const addLocalActor = (username: string, userId: string = uuid()) => {
    const actorId = uuid();
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, username);
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
      actorId,
      `${SEED_ORIGIN}/users/${username}`,
      `${SEED_ORIGIN}/users/${username}/inbox`,
      'local',
    );
    sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(actorId, userId);
    return { userId, actorId, username };
  };

  const addRemoteActor = (username: string, host = 'remote.example') => {
    const actorId = uuid();
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
      actorId,
      `https://${host}/users/${username}`,
      `https://${host}/users/${username}/inbox`,
      'remote',
    );
    sqlite.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').run(
      actorId,
      `https://${host}/@${username}`,
      username,
    );
    return { actorId, username, host };
  };

  const addLocalPost = (
    actor: { actorId: string; userId: string; username: string },
    createdAt: number,
    options: {
      content?: string;
      inReplyToUri?: string | null;
      timeline?: boolean;
      deletedAt?: number | null;
      visibility?: string;
    } = {},
  ) => {
    const postId = uuid();
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type,deletedAt) VALUES (?,?,?,?,?,?)').run(
      postId,
      actor.actorId,
      options.content ?? `post ${postId}`,
      createdAt,
      'local',
      options.deletedAt ?? null,
    );
    sqlite.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri,visibility) VALUES (?,?,?,?)').run(
      postId,
      actor.userId,
      options.inReplyToUri ?? null,
      options.visibility ?? 'public',
    );
    const timelineItemId = options.timeline === false ? undefined : addTimelineItem(actor.actorId, postId, createdAt);
    return { postId, timelineItemId, uri: `${SEED_ORIGIN}/users/${actor.username}/posts/${postId}` };
  };

  const addRemotePost = (
    actor: { actorId: string },
    createdAt: number,
    options: {
      content?: string;
      inReplyToUri?: string | null;
      timeline?: boolean;
      visibility?: string | null;
      recipientActorUris?: ReadonlyArray<string>;
    } = {},
  ) => {
    const postId = uuid();
    const uri = `https://remote.example/notes/${postId}`;
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
      postId,
      actor.actorId,
      options.content ?? `remote ${postId}`,
      createdAt,
      'remote',
    );
    sqlite.prepare('INSERT INTO remote_posts(postId,uri,inReplyToUri,visibility) VALUES (?,?,?,?)').run(
      postId,
      uri,
      options.inReplyToUri ?? null,
      options.visibility ?? null,
    );
    for (const actorUri of options.recipientActorUris ?? []) {
      sqlite.prepare('INSERT INTO remote_post_recipients(postId,actorUri) VALUES (?,?)').run(postId, actorUri);
    }
    const timelineItemId = options.timeline === true ? addTimelineItem(actor.actorId, postId, createdAt) : undefined;
    return { postId, uri, timelineItemId };
  };

  const addTimelineItem = (
    actorId: string,
    postId: string,
    createdAt: number,
    options: { type?: 'post' | 'repost'; repostId?: string | null; deletedAt?: number | null } = {},
  ) => {
    const timelineItemId = uuid();
    sqlite.prepare(
      'INSERT INTO timeline_items(timelineItemId,type,actorId,postId,repostId,createdAt,deletedAt) VALUES (?,?,?,?,?,?,?)',
    ).run(
      timelineItemId,
      options.type ?? 'post',
      actorId,
      postId,
      options.repostId ?? null,
      createdAt,
      options.deletedAt ?? null,
    );
    return timelineItemId;
  };

  const addRepost = (actorId: string, postId: string, createdAt: number, options: { timeline?: boolean } = {}) => {
    const repostId = uuid();
    sqlite.prepare('INSERT INTO reposts(repostId,actorId,postId,announceActivityUri,createdAt) VALUES (?,?,?,?,?)')
      .run(repostId, actorId, postId, null, createdAt);
    const timelineItemId = options.timeline === false
      ? undefined
      : addTimelineItem(actorId, postId, createdAt, { type: 'repost', repostId });
    return { repostId, timelineItemId };
  };

  const addFollow = (followerId: string, followingId: string) =>
    sqlite.prepare('INSERT INTO follows(followerId,followingId) VALUES (?,?)').run(followerId, followingId);

  const addMute = (userId: string, mutedActorId: string, createdAt = 1) => {
    const muteId = uuid();
    sqlite.prepare('INSERT INTO mutes(muteId,userId,mutedActorId,createdAt) VALUES (?,?,?,?)').run(
      muteId,
      userId,
      mutedActorId,
      createdAt,
    );
    return { muteId };
  };

  const addBlock = (userId: string, blockedActorId: string, createdAt = 1) => {
    const blockId = uuid();
    sqlite.prepare('INSERT INTO blocks(blockId,userId,blockedActorId,createdAt) VALUES (?,?,?,?)').run(
      blockId,
      userId,
      blockedActorId,
      createdAt,
    );
    return { blockId };
  };

  const addLike = (actorId: string, postId: string, createdAt = 1) => {
    const likeId = uuid();
    sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
      likeId,
      actorId,
      postId,
      'local',
      createdAt,
    );
    return { likeId };
  };

  const addEmojiReact = (actorId: string, postId: string, emoji: string, emojiImageUrl: string | null = null) =>
    sqlite.prepare(
      'INSERT INTO emoji_reacts(emojiReactId,actorId,postId,emoji,emojiImageUrl,createdAt) VALUES (?,?,?,?,?,?)',
    ).run(uuid(), actorId, postId, emoji, emojiImageUrl, 1);

  const addImage = (postId: string, url: string, altText: string | null = null) => {
    const imageId = uuid();
    sqlite.prepare('INSERT INTO post_images(imageId,postId,url,altText,createdAt) VALUES (?,?,?,?,?)').run(
      imageId,
      postId,
      url,
      altText,
      1,
    );
    return imageId;
  };

  const addLinkPreview = (postId: string, url: string, siteName: string | null, faviconUrl: string | null) =>
    sqlite.prepare(
      'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(uuid(), postId, url, 'Title', null, null, faviconUrl, siteName, 1);

  const addRelay = () => {
    const relayId = uuid();
    sqlite.prepare('INSERT INTO relays(relayId,inboxUrl,actorUri,status,createdAt) VALUES (?,?,?,?,?)').run(
      relayId,
      `https://relay.example/${relayId}/inbox`,
      `https://relay.example/${relayId}`,
      'accepted',
      1,
    );
    return relayId;
  };

  const addFederatedItem = (postId: string, relayId: string, receivedAt: number) => {
    const id = uuid();
    sqlite.prepare(
      'INSERT INTO federated_timeline_items(federatedTimelineItemId,postId,relayId,receivedAt) VALUES (?,?,?,?)',
    )
      .run(id, postId, relayId, receivedAt);
    return id;
  };

  const addNotification = (recipientUserId: string, type: string, createdAt: number, isRead = 0) => {
    const notificationId = uuid();
    sqlite.prepare('INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)')
      .run(notificationId, recipientUserId, type, isRead, createdAt);
    return notificationId;
  };

  const addLikeNotification = (
    recipientUserId: string,
    likerActorId: string,
    likedPostId: string,
    createdAt: number,
  ) => {
    const notificationId = addNotification(recipientUserId, 'like', createdAt);
    sqlite.prepare('INSERT INTO notification_likes(notificationId,likerActorId,likedPostId) VALUES (?,?,?)')
      .run(notificationId, likerActorId, likedPostId);
    return notificationId;
  };

  const addReplyNotification = (
    recipientUserId: string,
    replierActorId: string,
    replyPostId: string,
    originalPostId: string,
    createdAt: number,
  ) => {
    const notificationId = addNotification(recipientUserId, 'reply', createdAt);
    sqlite.prepare(
      'INSERT INTO notification_replies(notificationId,replierActorId,replyPostId,originalPostId) VALUES (?,?,?,?)',
    ).run(notificationId, replierActorId, replyPostId, originalPostId);
    return notificationId;
  };

  const addFollowNotification = (recipientUserId: string, followerActorId: string, createdAt: number) => {
    const notificationId = addNotification(recipientUserId, 'follow', createdAt);
    sqlite.prepare('INSERT INTO notification_follows(notificationId,followerActorId) VALUES (?,?)')
      .run(notificationId, followerActorId);
    return notificationId;
  };

  const addEmojiReactNotification = (
    recipientUserId: string,
    reactorActorId: string,
    reactedPostId: string,
    createdAt: number,
    emoji = ':wave:',
    emojiImageUrl: string | null = null,
  ) => {
    const notificationId = addNotification(recipientUserId, 'emojiReact', createdAt);
    sqlite.prepare(
      'INSERT INTO notification_emoji_reacts(notificationId,reactorActorId,reactedPostId,emoji,emojiImageUrl) VALUES (?,?,?,?,?)',
    ).run(notificationId, reactorActorId, reactedPostId, emoji, emojiImageUrl);
    return notificationId;
  };

  const addRepostNotification = (
    recipientUserId: string,
    reposterActorId: string,
    repostedPostId: string,
    createdAt: number,
  ) => {
    const notificationId = addNotification(recipientUserId, 'repost', createdAt);
    sqlite.prepare('INSERT INTO notification_reposts(notificationId,reposterActorId,repostedPostId) VALUES (?,?,?)')
      .run(notificationId, reposterActorId, repostedPostId);
    return notificationId;
  };

  const addBlueskyNotification = (
    recipientUserId: string,
    type: 'blueskyLike' | 'blueskyRepost' | 'blueskyFollow' | 'blueskyMention',
    createdAt: number,
    options: {
      blueskyUri?: string;
      reason?: string;
      subjectUri?: string | null;
      targetPostId?: string | null;
      text?: string | null;
      receipt?: boolean;
    } = {},
  ) => {
    const notificationId = addNotification(recipientUserId, type, createdAt);
    const blueskyUri = options.blueskyUri ?? `at://did:plc:alice/app.bsky.feed.like/${notificationId}`;
    sqlite.prepare(
      'INSERT INTO notification_bluesky(notificationId,blueskyUri,reason,authorDid,authorHandle,authorDisplayName,authorAvatar,subjectUri,targetPostId,text) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      notificationId,
      blueskyUri,
      options.reason
        ?? { blueskyLike: 'like', blueskyRepost: 'repost', blueskyFollow: 'follow', blueskyMention: 'mention' }[type],
      'did:plc:alice',
      'alice.bsky.social',
      'Alice',
      null,
      options.subjectUri === undefined
        ? (type === 'blueskyFollow' ? null : 'at://did:plc:me/app.bsky.feed.post/3kpost')
        : options.subjectUri,
      options.targetPostId ?? null,
      options.text ?? null,
    );
    if (options.receipt !== false) {
      sqlite.prepare('INSERT INTO bluesky_notification_receipts(uri,indexedAt,receivedAt) VALUES (?,?,?)')
        .run(blueskyUri, createdAt, createdAt);
    }
    return notificationId;
  };

  const setMarker = (userId: string, timeline: 'home' | 'notifications', lastReadId: string, version = 1) =>
    sqlite.prepare('INSERT INTO mastodon_markers(userId,timeline,lastReadId,version,updatedAt) VALUES (?,?,?,?,?)').run(
      userId,
      timeline,
      lastReadId,
      version,
      1_700_000_000_000,
    );

  return {
    uuid,
    addLocalActor,
    addRemoteActor,
    addLocalPost,
    addRemotePost,
    addTimelineItem,
    addRepost,
    addFollow,
    addMute,
    addBlock,
    addLike,
    addEmojiReact,
    addImage,
    addLinkPreview,
    addRelay,
    addFederatedItem,
    addLikeNotification,
    addReplyNotification,
    addFollowNotification,
    addEmojiReactNotification,
    addRepostNotification,
    addBlueskyNotification,
    setMarker,
  };
};
