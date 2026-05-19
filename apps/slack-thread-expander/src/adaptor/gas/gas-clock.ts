import type { ClockPort } from '../../domain/clock-port.ts';
import { SlackTs } from '../../domain/slack-ts.ts';

export const GasClock = {
  create: (): ClockPort => ({
    nowMs: () => Date.now(),
    nowSlackTs: () => SlackTs.fromEpochSeconds(Date.now() / 1000),
  }),
} as const;
