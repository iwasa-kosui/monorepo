import { createClient } from '../client.js';
import { printJson, stripHtml } from '../output.js';
import { loadSession } from '../session.js';

interface Notification {
  notification: {
    notification: {
      type: string;
      createdAt: string;
    };
    actor: {
      name: string | null;
      preferredUsername: string;
    };
  };
  sanitizedContent: string;
}

interface NotificationsResponse {
  notifications: Notification[];
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
    const actor = n.actor;
    const name = actor.name ?? actor.preferredUsername;
    const type = n.notification.type;
    const time = new Date(n.notification.createdAt).toLocaleString();
    const content = stripHtml(item.sanitizedContent);
    console.log(`[${time}] ${type} from ${name} (@${actor.preferredUsername})`);
    if (content) {
      console.log(`  ${content}`);
    }
    console.log('---');
  }
}
