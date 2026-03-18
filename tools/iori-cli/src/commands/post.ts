import { createClient } from '../client.js';
import { loadSession } from '../session.js';

export async function postCommand(args: string[]): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.error('Not logged in. Run `iori login` first.');
    process.exit(1);
  }

  const content = args[0];
  if (!content) {
    console.error('Usage: iori post <content>');
    process.exit(1);
  }

  const client = createClient(session.baseUrl, session.sessionId);
  await client.postJson('/api/v1/posts', { content });
  console.log('Posted.');
}
