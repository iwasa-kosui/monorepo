import { createClient } from '../client.js';
import { printJson, stripHtml } from '../output.js';
import { loadSession } from '../session.js';

interface Actor {
  username: string;
  url?: string;
}

interface NotificationItem {
  notification: {
    notification: {
      type: string;
    };
    likerActor?: Actor;
    followerActor?: Actor;
    replierActor?: Actor;
    createdAt: number;
  };
  sanitizedContent: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
}

function resolveActor(n: NotificationItem['notification']): Actor | undefined {
  return n.likerActor ?? n.followerActor ?? n.replierActor;
}

export async function notificationsCommand(args: string[]): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.error('Not logged in. Run `iori login` first.');
    process.exit(1);
  }

  const json = args.includes('--json');

  const client = createClient(session.baseUrl, session.sessionId);
  const data = await client.get<NotificationsResponse>('/api/v1/notifications');

  if (json) {
    printJson(data);
    return;
  }

  for (const item of data.notifications) {
    const n = item.notification;
    const type = n.notification.type;
    const time = new Date(n.createdAt).toLocaleString();
    const actor = resolveActor(n);
    const actorLabel = actor ? `@${actor.username}` : 'unknown';
    const content = stripHtml(item.sanitizedContent);
    console.log(`[${time}] ${type} from ${actorLabel}`);
    if (content) {
      console.log(`  ${content}`);
    }
    console.log('---');
  }
}
