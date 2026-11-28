import type { Post, TimelineEvent } from './scenario';

type Channeled = Pick<Post, 'channel'>;

export const typingLeadMs = 1500;

const sameChannelGapSeconds = 2;
const channelReadSeconds = 3;
const channelChangeGapSeconds = channelReadSeconds + typingLeadMs / 1000;

export const channelOfPost = (post: Channeled, defaultChannel: string): string => post.channel ?? defaultChannel;

export const openingChannel = (timeline: readonly TimelineEvent[], defaultChannel: string): string => {
  for (const event of timeline) {
    if (event.at === 0 && event.kind === 'post') return channelOfPost(event.post, defaultChannel);
  }
  return defaultChannel;
};

export const hasOpeningPost = (timeline: readonly TimelineEvent[]): boolean =>
  timeline.some((event) => event.at === 0 && event.kind === 'post');

export const postsInChannel = <T extends Channeled>(
  posts: readonly T[],
  channel: string,
  defaultChannel: string,
): T[] => posts.filter((post) => channelOfPost(post, defaultChannel) === channel);

export const placeholderOf = (channel: string, defaultChannel: string, defaultPlaceholder: string): string =>
  channel === defaultChannel ? defaultPlaceholder : defaultPlaceholder.replace(defaultChannel, () => channel);

export const typingStartMs = (atSeconds: number): number => atSeconds * 1000 - typingLeadMs;

export const openingSchedule = <T extends Channeled>(
  posts: readonly T[],
  defaultChannel: string,
): { readonly post: T; readonly at: number }[] => {
  const [first] = posts;
  let channel = first === undefined ? defaultChannel : channelOfPost(first, defaultChannel);
  let at = 0;
  return posts.map((post, index) => {
    const next = channelOfPost(post, defaultChannel);
    const gap = next === channel ? sameChannelGapSeconds : channelChangeGapSeconds;
    at = index === 0 ? 0 : at + gap;
    channel = next;
    return { post, at };
  });
};

export type ChannelState = {
  readonly channel: string;
  readonly pinned: boolean;
  readonly unread: Readonly<Record<string, number>>;
};

export const openingChannelState = (channel: string): ChannelState => ({ channel, pinned: false, unread: {} });

export const unreadOf = (state: ChannelState, channel: string): number => state.unread[channel] ?? 0;

export const totalUnread = (state: ChannelState): number =>
  Object.values(state.unread).reduce((sum, count) => sum + count, 0);

const showing = (state: ChannelState, channel: string, pinned: boolean): ChannelState => ({
  channel,
  pinned,
  unread: { ...state.unread, [channel]: 0 },
});

export const selectChannel = (state: ChannelState, channel: string): ChannelState => showing(state, channel, true);

export const revealChannel = (state: ChannelState): ChannelState => showing(state, state.channel, state.pinned);

export const receivePost = (
  state: ChannelState,
  post: { readonly channel: string; readonly self: boolean },
  visible: boolean,
): ChannelState => {
  if (post.self) return showing(state, post.channel, false);
  if (visible) {
    if (!state.pinned) return showing(state, post.channel, false);
    if (post.channel === state.channel) return state;
  }
  const counted = { ...state, unread: { ...state.unread, [post.channel]: unreadOf(state, post.channel) + 1 } };
  return state.pinned ? counted : { ...counted, channel: post.channel };
};

export const receiveAmbient = (state: ChannelState, channel: string, visible: boolean): ChannelState =>
  visible && channel === state.channel
    ? state
    : { ...state, unread: { ...state.unread, [channel]: unreadOf(state, channel) + 1 } };

export const receiveTyping = (state: ChannelState, channel: string, visible: boolean): ChannelState => {
  if (state.pinned) return state;
  return visible ? showing(state, channel, false) : { ...state, channel };
};

export const typingVisible = (state: ChannelState, channel: string): boolean =>
  !state.pinned || channel === state.channel;
