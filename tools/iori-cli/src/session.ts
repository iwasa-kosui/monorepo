import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export interface Session {
  baseUrl: string;
  sessionId: string;
}

const SESSION_DIR = path.join(os.homedir(), '.local', 'state', 'iori');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

export async function loadSession(): Promise<Session | null> {
  try {
    const data = await fs.readFile(SESSION_FILE, 'utf-8');
    return JSON.parse(data) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), 'utf-8');
}

export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(SESSION_FILE);
  } catch {
    // ignore if file doesn't exist
  }
}
