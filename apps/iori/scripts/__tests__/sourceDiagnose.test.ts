import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { diagnoseSource } from '../diagnose-source.mjs';
import {
  classifyJournal,
  formatSourceDiagnoseNotice,
  journalClasses,
  parseMemAvailableMegabytes,
  parseSourceRevision,
  parseSystemctlShow,
  runSourceDiagnosis,
  sourceDiagnoseNoticeLine,
} from '../source-diagnose-remote.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

const sha = 'a'.repeat(40);
const roots: string[] = [];
const captureStderr = () => {
  const writes: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation(
    ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write,
  );
  return writes;
};
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it.each([
  ['module-not-found', 'Error [ERR_MODULE_NOT_FOUND]: Cannot find package \'zod\' imported from /home/u/dist/index.js'],
  ['module-not-found', 'Error: Cannot find module \'./missing.js\''],
  ['syntax-error', 'SyntaxError: Unexpected token \'<\''],
  ['env-invalid', 'Error: Invalid environment variables:'],
  ['env-invalid', '    "code": "invalid_type",'],
  ['env-invalid', 'ZodError: [ { "path": ["DATABASE_URL"] } ]'],
  ['port-in-use', 'Error: listen EADDRINUSE: address already in use :::8000'],
  ['out-of-memory', 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'],
  ['out-of-memory', 'Error: spawn ENOMEM'],
  ['permission-denied', 'Error: EACCES: permission denied, open \'/opt/x\''],
  ['database-unavailable', 'Error: connect ECONNREFUSED 127.0.0.1:5432'],
  ['database-unavailable', 'error: password authentication failed for user "app"'],
  ['uncaught-exception', 'TypeError: x is not a function\n    at main (file:///home/u/dist/index.js:1:2)'],
  ['uncaught-exception', '[UnhandledPromiseRejection: This error originated either by throwing inside of an async'],
  ['other', 'microblog.service: Main process exited, code=exited, status=1/FAILURE'],
  ['other', 'microblog.service: Failed with result \'exit-code\'.'],
  ['none', 'listening on :8000\nGET / 200'],
  ['none', ''],
])('classifies the journal as %s for %j', (expected, text) => {
  expect(classifyJournal(text)).toBe(expected);
  expect(journalClasses).toContain(expected);
});
it('prefers the most recent specific line over older ones and over generic failure markers', () => {
  const text = [
    'Error: listen EADDRINUSE: address already in use :::8000',
    'microblog.service: Main process exited, code=exited, status=1/FAILURE',
    'Error [ERR_MODULE_NOT_FOUND]: Cannot find package \'x\'',
    '    at packageResolve (node:internal/modules/esm/resolve:1:1)',
    'microblog.service: Failed with result \'exit-code\'.',
  ].join('\n');
  expect(classifyJournal(text)).toBe('module-not-found');
});
it('does not treat ECONNREFUSED toward a remote host as a database failure', () => {
  expect(classifyJournal('Error: connect ECONNREFUSED 203.0.113.9:443')).toBe('none');
});
it('parses systemctl show and maps unknown states to other', () => {
  expect(parseSystemctlShow('ActiveState=failed\nSubState=auto-restart\nNRestarts=12\nExecMainStatus=1\n')).toEqual({
    active: 'failed',
    sub: 'auto-restart',
    restarts: 12,
    exitStatus: 1,
  });
  expect(parseSystemctlShow('ActiveState=weird\nSubState=/home/secret\nNRestarts=0\nExecMainStatus=0\n')).toEqual({
    active: 'other',
    sub: 'other',
    restarts: 0,
    exitStatus: 0,
  });
});
it('limits the numeric properties and rejects non-integers or missing properties', () => {
  expect(parseSystemctlShow('ActiveState=active\nSubState=running\nNRestarts=99999999\nExecMainStatus=4000\n'))
    .toMatchObject({ restarts: 999_999, exitStatus: 255 });
  for (
    const text of [
      'ActiveState=active\nSubState=running\nNRestarts=-1\nExecMainStatus=0\n',
      'ActiveState=active\nSubState=running\nNRestarts=x\nExecMainStatus=0\n',
      'ActiveState=active\nSubState=running\nExecMainStatus=0\n',
      'ActiveState=active\nSubState=running\nNRestarts=0\n',
      'SubState=running\nNRestarts=0\nExecMainStatus=0\n',
      '',
    ]
  ) expect(() => parseSystemctlShow(text)).toThrow('Invalid source diagnostic.');
});
it('reads MemAvailable in megabytes and the baked revision only when it is unique', () => {
  expect(parseMemAvailableMegabytes('MemTotal: 999 kB\nMemAvailable:  319488 kB\n')).toBe(312);
  expect(() => parseMemAvailableMegabytes('MemTotal: 999 kB\n')).toThrow('Invalid source diagnostic.');
  expect(parseSourceRevision(`const a=1,r="${sha}";x("not-a-sha")`)).toBe(sha);
  expect(parseSourceRevision('const r=void 0;')).toBe('unknown');
  expect(parseSourceRevision(`"${sha}" "${'b'.repeat(40)}"`)).toBe('unknown');
  expect(parseSourceRevision(`"${'A'.repeat(40)}" "${sha.slice(1)}"`)).toBe('unknown');
});
const values = {
  active: 'failed',
  sub: 'auto-restart',
  restarts: 12,
  exitStatus: 1,
  journal: 'module-not-found',
  freeze: 0,
  freezePending: 0,
  memAvailableMegabytes: 312,
  diskFreeMegabytes: 5120,
  sourceRevision: sha,
};
const accepted =
  `IORI_NOTICE stage=source-diagnose active=failed sub=auto-restart restarts=12 exit_status=1 journal=module-not-found freeze=0 freeze_pending=0 mem_available_mb=312 disk_free_mb=5120 source_revision=${sha}`;
it('formats the notice line and the allowlist accepts exactly that vocabulary', () => {
  expect(formatSourceDiagnoseNotice(values)).toBe(accepted);
  expect(sourceDiagnoseNoticeLine.test(accepted)).toBe(true);
  expect(sourceDiagnoseNoticeLine.test(accepted.replace(sha, 'unknown'))).toBe(true);
  for (const journal of journalClasses) {
    expect(formatSourceDiagnoseNotice({ ...values, journal })).toMatch(sourceDiagnoseNoticeLine);
  }
});
it.each([
  ['an extra field', `${accepted} path=/home/ec2-user`],
  ['leading space', ` ${accepted}`],
  ['trailing space', `${accepted} `],
  ['carriage return', `${accepted}\r`],
  ['a raw journal line', accepted.replace('module-not-found', 'Error: Cannot find module /home/ec2-user/x')],
  ['an unknown journal class', accepted.replace('module-not-found', 'secret')],
  ['an unknown active state', accepted.replace('active=failed', 'active=ip-10-0-0-1')],
  ['an unknown sub state', accepted.replace('sub=auto-restart', 'sub=/etc/passwd')],
  ['a path as revision', accepted.replace(sha, '/home/ec2-user/monorepo')],
  ['a short revision', accepted.replace(sha, 'a'.repeat(39))],
  ['an uppercase revision', accepted.replace(sha, 'A'.repeat(40))],
  ['a marker value of 2', accepted.replace('freeze=0', 'freeze=2')],
  ['a negative number', accepted.replace('restarts=12', 'restarts=-1')],
  ['a huge number', accepted.replace('restarts=12', 'restarts=1234567')],
  ['another stage', accepted.replace('stage=source-diagnose', 'stage=other')],
])('rejects a notice line with %s', (_label, line) => {
  expect(sourceDiagnoseNoticeLine.test(line)).toBe(false);
});
it('refuses to format a value outside the vocabulary', () => {
  expect(() => formatSourceDiagnoseNotice({ ...values, journal: 'raw line' })).toThrow('Invalid source diagnostic.');
  expect(() => formatSourceDiagnoseNotice({ ...values, active: '/home/x' })).toThrow('Invalid source diagnostic.');
  expect(() => formatSourceDiagnoseNotice({ ...values, freeze: 2 })).toThrow('Invalid source diagnostic.');
});

const journalctl = '/usr/bin/journalctl';
const systemctl = '/usr/bin/systemctl';
const rawLine = 'Error [ERR_MODULE_NOT_FOUND]: Cannot find package \'secret-package\' imported from /home/ec2-user/x';
type Result = { stdout: string; stderr: string };
const fakeCommands = (
  { sudoProbe = true, sudoRun = true, plain = { stdout: rawLine, stderr: '' } as Result | Error } = {},
) => {
  const calls: string[] = [];
  const captured: unknown[] = [];
  const runCommand = async (
    program: string,
    args: string[],
    options: { captureOutput?: (output: Result) => Promise<void> },
  ) => {
    const line = [program, ...args].join(' ');
    calls.push(line);
    captured.push(options.captureOutput);
    if (line === '/bin/sh -c command -v systemctl') return { stdout: `${systemctl}\n`, stderr: '' };
    if (line === '/bin/sh -c command -v journalctl') return { stdout: `${journalctl}\n`, stderr: '' };
    if (program === systemctl) {
      return {
        stdout: 'ActiveState=failed\nSubState=auto-restart\nNRestarts=12\nExecMainStatus=1\n',
        stderr: '',
      };
    }
    if (program === 'sudo' && args[1] === '-l') {
      if (!sudoProbe) throw new Error('Migration command failed; outcome may be uncertain.');
      return { stdout: '', stderr: '' };
    }
    if (program === 'sudo') {
      if (!sudoRun) throw new Error('Migration command failed; outcome may be uncertain.');
      return { stdout: rawLine, stderr: '' };
    }
    if (program === journalctl) {
      if (plain instanceof Error) throw plain;
      return plain;
    }
    throw new Error(`unexpected ${line}`);
  };
  return { calls, captured, runCommand };
};
const setup = async () => {
  const home = await createFixtureDirectory('iori-diagnose-');
  roots.push(home);
  await mkdir(join(home, '.iori-migration'), { mode: 0o700 });
  await mkdir(join(home, 'monorepo/apps/iori/dist'), { recursive: true });
  await writeFile(join(home, 'monorepo/apps/iori/dist/index.js'), `const r="${sha}";`);
  const meminfoPath = join(home, 'meminfo');
  await writeFile(meminfoPath, 'MemTotal: 1000000 kB\nMemAvailable:  319488 kB\n');
  return { home, meminfoPath };
};
const run = async (commands: ReturnType<typeof fakeCommands>, markers: string[] = []) => {
  const { home, meminfoPath } = await setup();
  for (const marker of markers) await writeFile(join(home, '.iori-migration', marker), '{}');
  const lines: string[] = [];
  await runSourceDiagnosis({ home, meminfoPath, runCommand: commands.runCommand as never, write: l => lines.push(l) });
  return lines;
};
const noticeParts = (line: string) => Object.fromEntries(line.split(' ').slice(2).map(part => part.split('=')));
it('collects every value into one notice using sudo for the journal when the probe permits it', async () => {
  const commands = fakeCommands();
  const lines = await run(commands, ['freeze.pending']);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(sourceDiagnoseNoticeLine);
  expect(noticeParts(lines[0])).toMatchObject({
    active: 'failed',
    sub: 'auto-restart',
    restarts: '12',
    exit_status: '1',
    journal: 'module-not-found',
    freeze: '0',
    freeze_pending: '1',
    mem_available_mb: '312',
    source_revision: sha,
  });
  expect(Number(noticeParts(lines[0]).disk_free_mb)).toBeGreaterThan(0);
  const journalArguments = '-u microblog -n 200 --no-pager -o cat';
  expect(commands.calls).toEqual([
    '/bin/sh -c command -v systemctl',
    `${systemctl} show microblog --property=ActiveState,SubState,NRestarts,ExecMainStatus`,
    '/bin/sh -c command -v journalctl',
    `sudo -n -l ${journalctl} ${journalArguments}`,
    `sudo -n ${journalctl} ${journalArguments}`,
  ]);
  expect(lines.join('')).not.toMatch(/secret-package|\/home\//);
});
it('reads the journal without sudo when sudo does not permit journalctl', async () => {
  const commands = fakeCommands({ sudoProbe: false });
  const lines = await run(commands, ['freeze.json']);
  expect(noticeParts(lines[0])).toMatchObject({ journal: 'module-not-found', freeze: '1', freeze_pending: '0' });
  expect(commands.calls.filter(call => call.startsWith('sudo'))).toEqual([
    `sudo -n -l ${journalctl} -u microblog -n 200 --no-pager -o cat`,
  ]);
  expect(commands.calls.at(-1)).toBe(`${journalctl} -u microblog -n 200 --no-pager -o cat`);
});
it('reports the journal as unavailable when neither sudo nor a plain read works', async () => {
  const commands = fakeCommands({ sudoProbe: false, plain: new Error('Migration command failed.') });
  expect(noticeParts((await run(commands))[0]).journal).toBe('unavailable');
});
it('reports the journal as unavailable when journalctl lacks permission but exits zero', async () => {
  const commands = fakeCommands({
    sudoProbe: false,
    plain: { stdout: '', stderr: 'No journal files were opened due to insufficient permissions.\n' },
  });
  expect(noticeParts((await run(commands))[0]).journal).toBe('unavailable');
});
it('runs only read commands and never lets command output reach the SSH stderr stream', async () => {
  const commands = fakeCommands();
  await run(commands);
  expect(commands.calls.join('\n')).not.toMatch(
    /\b(?:stop|start|restart|reload|enable|daemon-reload|install|chown|rm|mv)\b/,
  );
  for (const captureOutput of commands.captured) {
    expect(captureOutput).toBeTypeOf('function');
    expect(await (captureOutput as (output: Result) => Promise<void>)({ stdout: rawLine, stderr: rawLine })).toBe(
      undefined,
    );
  }
});

const sshOptions = {
  host: 'source.invalid',
  user: 'ec2-user',
  identityFile: '/private/key',
  knownHostsFile: '/private/known-hosts',
};
it('runs the fixed bundle over SSH stdin and relays only the exact notice once', async () => {
  const writes = captureStderr();
  const calls: { program: string; args: string[]; input?: string }[] = [];
  await diagnoseSource(sshOptions, {
    runCommand: async (program, args, commandOptions) => {
      calls.push({ program, args, input: commandOptions.input });
      await commandOptions.captureOutput?.({
        stdout: '',
        stderr: [
          `${accepted} extra=/home/secret`,
          accepted,
          accepted,
          rawLine,
          'secret-user@secret-host.invalid: noise',
        ].join('\n'),
      });
      return { stdout: '', stderr: '' };
    },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].program).toBe('ssh');
  expect(calls[0].args.slice(-3)).toEqual(['"$HOME/.nvm/versions/node/v24.12.0/bin/node"', '--input-type=module', '-']);
  expect(calls[0].args).toContain('StrictHostKeyChecking=yes');
  expect(calls[0].input).toContain('runSourceDiagnosis');
  expect(writes).toEqual([`${accepted}\n`]);
});
it('fails with a fixed diagnostic when the remote side produced no notice', async () => {
  const writes = captureStderr();
  await expect(diagnoseSource(sshOptions, {
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({ stdout: '', stderr: rawLine });
      return { stdout: '', stderr: '' };
    },
  })).rejects.toThrow('Source operation failed.');
  expect(writes).toEqual([
    'IORI_DIAG stage=diagnose-remote program=ssh exit=none signal=none reason=source-operation-failed\n',
  ]);
});
it('classifies an invalid remote diagnostic without relaying remote text', async () => {
  const writes = captureStderr();
  await expect(diagnoseSource(sshOptions, {
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({ stdout: '', stderr: `Error: Invalid source diagnostic.\n${rawLine}` });
      throw Object.assign(new Error('x'), { exitCode: 1 });
    },
  })).rejects.toThrow('x');
  expect(writes).toEqual([
    'IORI_DIAG stage=diagnose-remote program=ssh exit=1 signal=none reason=diagnostic-invalid\n',
  ]);
});
