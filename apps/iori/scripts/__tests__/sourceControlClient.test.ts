import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

import { requestSourceControl } from '../source-control-client.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

const args = ['status', 'a'.repeat(40), 'deploy_1'];
const sink = () => new Writable({ write: (_chunk, _encoding, done) => done() });
const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const setup = async () => {
  const base = await createFixtureDirectory('iori-client-', true);
  roots.push(base);
  return base;
};
const listenWith = async (base: string, response: string) => {
  const path = join(base, 'control.sock');
  const server = createServer((socket) => {
    socket.on('error', () => {});
    socket.once('data', () => socket.end(response));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(path, resolve));
  await chmod(path, 0o600);
};
const notReady = { message: 'Source control is not ready.', notReady: true };

it('marks a missing base directory as not ready', async () => {
  const base = await setup();
  await expect(requestSourceControl({ args, output: sink(), base: join(base, 'missing') })).rejects.toMatchObject(
    notReady,
  );
});
it('marks a missing control socket as not ready', async () => {
  const base = await setup();
  await expect(requestSourceControl({ args, output: sink(), base })).rejects.toMatchObject(notReady);
});
it('marks a refused connection as not ready', async () => {
  const base = await setup();
  const path = join(base, 'control.sock');
  const child = spawn(process.execPath, [
    '-e',
    `const p=${
      JSON.stringify(path)
    };require('node:net').createServer().listen(p,()=>{require('node:fs').chmodSync(p,0o600);console.log('ready')})`,
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((resolve) => child.stdout.once('data', resolve));
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('close', resolve));
  await expect(requestSourceControl({ args, output: sink(), base })).rejects.toMatchObject(notReady);
});
it('marks the invalid_command response sent before the application is ready as not ready', async () => {
  const base = await setup();
  await listenWith(base, '{"ok":false,"error":"invalid_command"}\n');
  await expect(requestSourceControl({ args, output: sink(), base })).rejects.toMatchObject(notReady);
});
it('keeps other rejections and unsafe control paths as ordinary failures', async () => {
  const base = await setup();
  await listenWith(base, '{"ok":false,"error":"control_rejected"}\n');
  const rejected = await requestSourceControl({ args, output: sink(), base }).catch((error) => error);
  expect(rejected.message).toBe('Source control rejected.');
  expect(rejected.notReady).toBeUndefined();
  await chmod(base, 0o755);
  const unsafe = await requestSourceControl({ args, output: sink(), base }).catch((error) => error);
  expect(unsafe.message).toBe('Unsafe source control.');
  expect(unsafe.notReady).toBeUndefined();
});
const runCli = (home: string) =>
  spawnSync(process.execPath, [fileURLToPath(new URL('../source-control.mjs', import.meta.url)), ...args], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
it('exits with 75 and the fixed message only when the control socket is not ready', async () => {
  const home = await setup();
  const missing = runCli(home);
  expect(missing.status).toBe(75);
  expect(missing.stderr).toBe('Source control is not ready.\n');
  await mkdir(join(home, '.iori-migration'), { mode: 0o755 });
  await chmod(join(home, '.iori-migration'), 0o755);
  const unsafe = runCli(home);
  expect(unsafe.status).toBe(1);
  expect(unsafe.stderr).toBe('Source control unavailable or rejected\n');
});
