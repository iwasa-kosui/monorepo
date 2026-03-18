import { stdin, stdout } from 'node:process';
import * as readline from 'node:readline/promises';

import { createClient } from '../client.js';
import { saveSession } from '../session.js';

export async function loginCommand(args: string[]): Promise<void> {
  let server: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server' && args[i + 1]) {
      server = args[i + 1];
      i++;
    }
  }

  if (!server) {
    console.error('Usage: iori login --server <url>');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const username = await rl.question('Username: ');
    const password = await readPassword();

    const client = createClient(server);
    const res = await client.getResponse('/api/v1/sign-in', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Login failed: ${body}`);
      process.exit(1);
    }

    const setCookie = res.headers.get('set-cookie');
    const sessionId = setCookie?.match(/sessionId=([^;]+)/)?.[1];

    if (!sessionId) {
      console.error('Login succeeded but no session cookie was returned.');
      process.exit(1);
    }

    await saveSession({ baseUrl: server, sessionId });
    console.log('Logged in successfully.');
  } finally {
    rl.close();
  }
}

async function readPassword(): Promise<string> {
  return new Promise((resolve) => {
    stdout.write('Password: ');
    const origSetRawMode = stdin.setRawMode?.bind(stdin);
    if (origSetRawMode) {
      origSetRawMode(true);
    }
    let password = '';
    const onData = (ch: Buffer) => {
      const c = ch.toString('utf-8');
      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
        if (origSetRawMode) {
          origSetRawMode(false);
        }
        stdout.write('\n');
        resolve(password);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else if (c === '\u007f' || c === '\b') {
        // Backspace
        password = password.slice(0, -1);
      } else {
        password += c;
      }
    };
    stdin.on('data', onData);
  });
}
