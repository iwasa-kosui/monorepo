export const firstUnreadsAfter = <T>(
  firsts: ReadonlyMap<string, T>,
  unread: Readonly<Record<string, number>>,
  arrival: { readonly channel: string; readonly post: T } | null,
): ReadonlyMap<string, T> => {
  const next = new Map<string, T>();
  for (const [channel, post] of firsts) {
    if ((unread[channel] ?? 0) > 0) next.set(channel, post);
  }
  if (arrival !== null && (unread[arrival.channel] ?? 0) > 0 && !next.has(arrival.channel)) {
    next.set(arrival.channel, arrival.post);
  }
  return next;
};

export const scrollTopToReveal = (input: {
  readonly scrollTop: number;
  readonly feedTop: number;
  readonly paddingTop: number;
  readonly targetTop: number | null;
  readonly scrollHeight: number;
  readonly toEnd: boolean;
}): number => {
  if (input.targetTop !== null) return input.scrollTop + input.targetTop - input.feedTop - input.paddingTop;
  return input.toEnd ? input.scrollHeight : input.scrollTop;
};
