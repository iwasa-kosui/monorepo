import { blueskyLikedPostsFailureMessage, fetchBlueskyLikedPosts } from '../api/blueskyProfileClient.ts';
import { BlueskyPostList } from './BlueskyPostList.tsx';

export const BlueskyLikedPosts = () => (
  <BlueskyPostList
    load={fetchBlueskyLikedPosts}
    emptyMessage='Bluesky でいいねした投稿はまだありません'
    failureMessage={blueskyLikedPostsFailureMessage}
  />
);
