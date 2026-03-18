import { createClient } from '../client.js';
import { loadSession } from '../session.js';

export async function deleteCommand(args: string[]): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.error('Not logged in. Run `iori login` first.');
    process.exit(1);
  }

  const postId = args[0];
  if (!postId) {
    console.error('Usage: iori delete <postId>');
    process.exit(1);
  }

  const client = createClient(session.baseUrl, session.sessionId);
  await client.del(`/api/v1/posts/${postId}`);
  console.log('Deleted.');
}
