export interface PostWithAuthor {
  type: 'local' | 'remote';
  postId: string;
  actorId: string;
  content: string;
  createdAt: string;
  username: string;
  logoUri?: string;
  liked: boolean;
  reposted: boolean;
  likeCount: number;
  repostCount: number;
  uri?: string;
}

export interface PostTimelineItem {
  type: 'post';
  timelineItemId: string;
  post: PostWithAuthor;
  createdAt: string;
}

export interface RepostTimelineItem {
  type: 'repost';
  timelineItemId: string;
  post: PostWithAuthor;
  repostedBy: {
    actorId: string;
    username: string;
    logoUri?: string;
  };
  createdAt: string;
}

export type TimelineItemData = PostTimelineItem | RepostTimelineItem;

export interface HomeTimelineResponse {
  timelineItems: TimelineItemData[];
}

export type Mode = 'normal' | 'compose';
