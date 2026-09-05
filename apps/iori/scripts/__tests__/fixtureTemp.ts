import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// macOS's default TMPDIR can exceed the Unix socket path limit.
export const createFixtureDirectory = async (prefix: string, socket = false) =>
  mkdtemp(join(await realpath(socket ? '/tmp' : tmpdir()), prefix));
