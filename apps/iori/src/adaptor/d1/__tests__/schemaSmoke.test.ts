import { describe, expect, it } from 'vitest';

import { schema } from '../schema.ts';

describe('D1 schema', () => {
  it('exports all application tables required by migration', () => {
    expect(Object.keys(schema).sort()).toEqual([
      'actorsTable',
      'articlesTable',
      'domainEventsTable',
      'emojiReactsTable',
      'feedEntriesTable',
      'feedSourcesTable',
      'federatedTimelineItemsTable',
      'followsTable',
      'instanceActorKeysTable',
      'keysTable',
      'likesTable',
      'linkPreviewsTable',
      'localActorsTable',
      'localLikesTable',
      'localPostsTable',
      'mastodonMarkersTable',
      'mutesTable',
      'notificationEmojiReactsTable',
      'notificationFollowsTable',
      'notificationLikesTable',
      'notificationRepliesTable',
      'notificationsTable',
      'oauthAccessTokensTable',
      'oauthApplicationsTable',
      'oauthAuthorizationCodesTable',
      'postImagesTable',
      'postsTable',
      'pushSubscriptionsTable',
      'relaysTable',
      'remoteActorsTable',
      'remoteLikesTable',
      'remotePostsTable',
      'repostsTable',
      'sessionsTable',
      'timelineItemsTable',
      'userPasswordsTable',
      'usersTable',
    ].sort());
  });
});
