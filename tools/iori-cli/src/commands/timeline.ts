import { createClient } from '../client.js';
import { printJson, stripHtml } from '../output.js';
import { loadSession } from '../session.js';

interface TimelineItem {
  post: {
    id: string;
    content: string;
    createdAt: string;
  };
  actor: {
    name: string | null;
    preferredUsername: string;
  };
}

export async function timelineCommand(args: string[]): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.error('Not logged in. Run `iori login` first.');
    process.exit(1);
  }

  let type = 'home';
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    }
    if (args[i] === '--json') {
      json = true;
    }
  }

  const pathMap: Record<string, string> = {
    home: '/api/v1/home',
    federated: '/api/v1/federated',
    server: '/api/v1/server-timeline',
  };

  const apiPath = pathMap[type];
  if (!apiPath) {
    console.error(`Unknown timeline type: ${type}. Use home, federated, or server.`);
    process.exit(1);
  }

  const client = createClient(session.baseUrl, session.sessionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await client.get<any>(apiPath);

  if (json) {
    printJson(data);
    return;
  }

  const items = extractItems(type, data);
  for (const item of items) {
    const name = item.actor?.name ?? item.actor?.preferredUsername ?? 'unknown';
    const content = stripHtml(item.post.content);
    const time = new Date(item.post.createdAt).toLocaleString();
    const handle = item.actor?.preferredUsername ? `@${item.actor.preferredUsername}` : '';
    console.log(`[${time}] ${name} ${handle}`.trimEnd());
    console.log(content);
    console.log(`  id: ${item.post.id}`);
    console.log('---');
  }
}

// Each endpoint returns a different shape
function extractItems(type: string, data: Record<string, unknown>): TimelineItem[] {
  if (type === 'home') {
    return (data.timelineItems ?? []) as TimelineItem[];
  }
  if (type === 'federated') {
    return (data.items ?? []) as TimelineItem[];
  }
  if (type === 'server') {
    // server-timeline returns { posts: [{ content, id, createdAt, actor, ... }] }
    // actor info may be nested differently
    return (data.posts ?? []) as TimelineItem[];
  }
  return [];
}
