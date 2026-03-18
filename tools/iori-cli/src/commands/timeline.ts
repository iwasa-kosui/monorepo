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
function extractItems(type: string, data: Record<string, any>): DisplayItem[] {
  if (type === 'home' || type === 'federated') {
    // home: { timelineItems: [{ post: PostWithAuthor, ... }] }
    // federated: { items: [{ post: PostWithAuthor, ... }] }
    const raw = (type === 'home' ? data.timelineItems : data.items) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((item: any) => ({
      postId: item.post.postId,
      content: item.post.content,
      createdAt: item.post.createdAt,
      username: item.post.username,
    }));
  }
  if (type === 'server') {
    // server-timeline: { posts: [PostWithAuthor] } (flat, no post nesting)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.posts ?? []).map((post: any) => ({
      postId: post.postId,
      content: post.content,
      createdAt: post.createdAt,
      username: post.username,
    }));
  }
  return [];
}
