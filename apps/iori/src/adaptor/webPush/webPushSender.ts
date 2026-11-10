import { RA } from '@iwasa-kosui/result';
import webpush from 'web-push';

import type { PushSubscription } from '../../domain/pushSubscription/pushSubscription.ts';
import { Env } from '../../env.ts';
import { singleton } from '../../helper/singleton.ts';
import type { PushPayload, SendError, WebPushSender as WebPushSenderPort } from './webPush.ts';

export type { PushPayload, SendError } from './webPush.ts';
export type WebPushSender = WebPushSenderPort;

const createSender = (): WebPushSender => {
  const env = Env.getInstance();

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const send = async (subscription: PushSubscription, payload: PushPayload): RA<void, SendError> => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dhKey,
            auth: subscription.authKey,
          },
        },
        JSON.stringify(payload),
      );
      return RA.ok(undefined);
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      return RA.err({
        type: 'SendError',
        message: String(error),
        statusCode,
      });
    }
  };

  return { send };
};

const getInstance = singleton(createSender);

export const WebPushSender = {
  getInstance,
} as const;
