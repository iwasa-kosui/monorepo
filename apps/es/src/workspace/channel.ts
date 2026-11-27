import type { Post } from './scenario';

type Channeled = Pick<Post, 'channel'>;

export const typingLeadMs = 1500;

const sameChannelGapSeconds = 2;
const channelReadSeconds = 3;
const channelChangeGapSeconds = channelReadSeconds + typingLeadMs / 1000;

export const channelOfPost = (post: Channeled, defaultChannel: string): string => post.channel ?? defaultChannel;

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
  let channel = defaultChannel;
  let at = 0;
  return posts.map((post, index) => {
    const next = channelOfPost(post, defaultChannel);
    const gap = next === channel ? sameChannelGapSeconds : channelChangeGapSeconds;
    at = index === 0 ? (next === channel ? 0 : gap) : at + gap;
    channel = next;
    return { post, at };
  });
};
