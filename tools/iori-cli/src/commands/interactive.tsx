import { render } from 'ink';
import React from 'react';

import { createClient } from '../client.js';
import { loadSession } from '../session.js';
import { App } from '../tui/App.js';

export async function interactiveCommand(): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.error('Not logged in. Run `iori login` first.');
    process.exit(1);
  }

  const client = createClient(session.baseUrl, session.sessionId);
  const { waitUntilExit } = render(<App client={client} />);
  await waitUntilExit();
}
