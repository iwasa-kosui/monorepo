import type { RA } from '@iwasa-kosui/result';

import type { PushSubscription } from '../../domain/pushSubscription/pushSubscription.ts';

export type PushPayload = Readonly<{
  title: string;
  body: string;
  icon?: string;
  url?: string;
}>;

export type SendError = Readonly<{
  type: 'SendError';
  message: string;
  statusCode?: number;
}>;

export type WebPushSender = Readonly<{
  send: (subscription: PushSubscription, payload: PushPayload) => RA<void, SendError>;
}>;
