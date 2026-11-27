export const firstUnreadOf = <T>(current: T | null, connected: boolean, next: T): T =>
  current === null || !connected ? next : current;

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
