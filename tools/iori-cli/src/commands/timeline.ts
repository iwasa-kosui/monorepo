import { createClient } from '../client.js';
import { printJson, stripHtml } from '../output.js';
import { loadSession } from '../session.js';

interface DisplayItem {
  postId: string;
  content: string;
  createdAt: string;
  username: string;
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

  const endpointMap: Record<string, { path: string; params?: Record<string, string> }> = {
    home: { path: '/api/v1/home' },
    federated: { path: '/api/v1/timelines/public', params: { remote: 'true' } },
    server: { path: '/api/v1/timelines/public', params: { local: 'true' } },
  };

  const endpoint = endpointMap[type];
  if (!endpoint) {
    console.error(`Unknown timeline type: ${type}. Use home, federated, or server.`);
    process.exit(1);
  }

  const client = createClient(session.baseUrl, session.sessionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await client.get<any>(endpoint.path, endpoint.params);

  if (json) {
    printJson(data);
    return;
  }

  const items = extractItems(type, data);
  for (const item of items) {
    const content = stripHtml(item.content);
    const time = new Date(item.createdAt).toLocaleString();
    console.log(`[${time}] @${item.username}`);
    console.log(content);
    console.log(`  id: ${item.postId}`);
    console.log('---');
  }
}

// Each endpoint returns a different shape; normalize to DisplayItem[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractItems(type: string, data: any): DisplayItem[] {
  if (type === 'home') {
    // home: { timelineItems: [{ post: PostWithAuthor, ... }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.timelineItems ?? []).map((item: any) => ({
      postId: item.post.postId,
      content: item.post.content,
      createdAt: item.post.createdAt,
      username: item.post.username,
    }));
  }
  if (type === 'federated' || type === 'server') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Array.isArray(data) ? data : []).map((status: any) => ({
      postId: status.id,
      content: status.content,
      createdAt: status.created_at,
      username: status.account.acct,
    }));
  }
  return [];
}
