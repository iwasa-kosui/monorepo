import type { SlackTs } from './slack-ts.ts';

export type ClockPort = Readonly<{
  nowMs: () => number;
  nowSlackTs: () => SlackTs;
}>;
