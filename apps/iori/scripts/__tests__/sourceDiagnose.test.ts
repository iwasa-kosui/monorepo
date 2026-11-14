import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { diagnoseSource } from '../diagnose-source.mjs';
import {
  formatSourceDiagnoseNotice,
  journalClasses,
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

const exited = 'microblog.service: Main process exited, code=exited, status=1/FAILURE';
const failed = 'microblog.service: Failed with result \'exit-code\'.';
const restart = 'microblog.service: Scheduled restart job, restart counter is at 5.';
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
  activeEnter: '20261101T0612Z',
  journalTruncated: 0,
  exits: 3,
  scheduledRestarts: 2,
  counts: {
    'module-not-found': 4,
    'syntax-error': 0,
    'env-invalid': 0,
    'port-in-use': 1,
    'out-of-memory': 0,
    'permission-denied': 0,
    'database-unavailable': 0,
    'uncaught-exception': 7,
  },
};
const acceptedHead =
  `IORI_NOTICE stage=source-diagnose active=failed sub=auto-restart restarts=12 exit_status=1 journal=module-not-found freeze=0 freeze_pending=0 mem_available_mb=312 disk_free_mb=5120 source_revision=${sha}`;
const acceptedTail =
  'active_enter=20261101T0612Z journal_window_h=6 journal_truncated=0 exits=3 scheduled_restarts=2 jc_module_not_found=4 jc_syntax_error=0 jc_env_invalid=0 jc_port_in_use=1 jc_out_of_memory=0 jc_permission_denied=0 jc_database_unavailable=0 jc_uncaught_exception=7';
const accepted = `${acceptedHead} ${acceptedTail}`;
it('formats the notice line and the allowlist accepts exactly that vocabulary', () => {
  expect(formatSourceDiagnoseNotice(values)).toBe(accepted);
  expect(sourceDiagnoseNoticeLine.test(accepted)).toBe(true);
  expect(sourceDiagnoseNoticeLine.test(accepted.replace(sha, 'unknown'))).toBe(true);
  expect(sourceDiagnoseNoticeLine.test(accepted.replace('active_enter=20261101T0612Z', 'active_enter=unknown')))
    .toBe(true);
  expect(sourceDiagnoseNoticeLine.test(accepted.replace('journal_truncated=0', 'journal_truncated=1'))).toBe(true);
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
  ['the previous format without the new fields', acceptedHead],
  ['a missing active_enter', accepted.replace('active_enter=20261101T0612Z ', '')],
  ['a missing journal_window_h', accepted.replace('journal_window_h=6 ', '')],
  ['a missing journal_truncated', accepted.replace('journal_truncated=0 ', '')],
  ['a missing exits', accepted.replace('exits=3 ', '')],
  ['a missing scheduled_restarts', accepted.replace('scheduled_restarts=2 ', '')],
  ['a missing jc_uncaught_exception', accepted.replace(' jc_uncaught_exception=7', '')],
  ['a missing jc_module_not_found', accepted.replace(' jc_module_not_found=4', '')],
  [
    'reordered count fields',
    accepted.replace('jc_syntax_error=0 jc_env_invalid=0', 'jc_env_invalid=0 jc_syntax_error=0'),
  ],
  ['an unnamed extra count', `${accepted} jc_other=1`],
  ['a window other than 6', accepted.replace('journal_window_h=6', 'journal_window_h=12')],
  ['a truncated marker of 2', accepted.replace('journal_truncated=0', 'journal_truncated=2')],
  ['a seconds-precision active_enter', accepted.replace('20261101T0612Z', '20261101T061200Z')],
  ['an active_enter without Z', accepted.replace('20261101T0612Z', '20261101T0612')],
  ['an active_enter path', accepted.replace('20261101T0612Z', '/home/ec2-user')],
  ['a negative count', accepted.replace('exits=3', 'exits=-1')],
  ['a huge count', accepted.replace('jc_port_in_use=1', 'jc_port_in_use=1000000')],
  ['a non-numeric count', accepted.replace('scheduled_restarts=2', 'scheduled_restarts=x')],
])('rejects a notice line with %s', (_label, line) => {
  expect(sourceDiagnoseNoticeLine.test(line)).toBe(false);
});
it('refuses to format a value outside the vocabulary', () => {
  expect(() => formatSourceDiagnoseNotice({ ...values, journal: 'raw line' })).toThrow('Invalid source diagnostic.');
  expect(() => formatSourceDiagnoseNotice({ ...values, active: '/home/x' })).toThrow('Invalid source diagnostic.');
  expect(() => formatSourceDiagnoseNotice({ ...values, freeze: 2 })).toThrow('Invalid source diagnostic.');
  expect(() => formatSourceDiagnoseNotice({ ...values, activeEnter: '/home/x' })).toThrow('Invalid source diagnostic.');
  expect(() => formatSourceDiagnoseNotice({ ...values, exits: 1_000_000 })).toThrow('Invalid source diagnostic.');
  expect(() => formatSourceDiagnoseNotice({ ...values, counts: undefined as never })).toThrow(
    'Invalid source diagnostic.',
  );
});

const journalctl = '/usr/bin/journalctl';
const systemctl = '/usr/bin/systemctl';
const rawLine = 'Error [ERR_MODULE_NOT_FOUND]: Cannot find package \'secret-package\' imported from /home/ec2-user/x';
type Result = { stdout: string; stderr: string };
const journalText = [rawLine, exited, failed, restart].join('\n');
const fakeCommands = (
  {
    sudoProbe = true,
    sudoRun = true,
    sudoOutput = journalText,
    overflow = false,
    activeEnter = 'ActiveEnterTimestamp=@1793513520\n' as string | Error,
    plain = { stdout: journalText, stderr: '' } as Result | Error,
  } = {},
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
    if (program === systemctl && args.includes('--property=ActiveEnterTimestamp')) {
      if (activeEnter instanceof Error) throw activeEnter;
      return { stdout: activeEnter, stderr: '' };
    }
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
      if (overflow) {
        await options.captureOutput?.({ stdout: sudoOutput, stderr: '' });
        throw new Error('Migration command failed; outcome may be uncertain.');
      }
      return { stdout: sudoOutput, stderr: '' };
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
    active_enter: '20261101T0612Z',
    journal_window_h: '6',
    journal_truncated: '0',
    exits: '1',
    scheduled_restarts: '1',
    jc_module_not_found: '1',
    jc_syntax_error: '0',
    jc_env_invalid: '0',
    jc_port_in_use: '0',
    jc_out_of_memory: '0',
    jc_permission_denied: '0',
    jc_database_unavailable: '0',
    jc_uncaught_exception: '0',
  });
  expect(Number(noticeParts(lines[0]).disk_free_mb)).toBeGreaterThan(0);
  const journalArguments = '-u microblog --since=-6h --no-pager -o cat';
  expect(commands.calls).toEqual([
    '/bin/sh -c command -v systemctl',
    `${systemctl} show microblog --property=ActiveState,SubState,NRestarts,ExecMainStatus`,
    `${systemctl} show microblog --property=ActiveEnterTimestamp --timestamp=unix`,
    '/bin/sh -c command -v journalctl',
    `sudo -n -l ${journalctl} ${journalArguments}`,
    `sudo -n ${journalctl} ${journalArguments}`,
  ]);
  expect(lines.join('')).not.toMatch(/secret-package|\/home\//);
});
it('runs only read commands and never lets command output reach the SSH stderr stream', async () => {
  const commands = fakeCommands();
  await run(commands);
  expect(commands.calls.join('\n')).not.toMatch(
    /\b(?:stop|start|restart|reload|enable|daemon-reload|install|chown|rm|mv)\b/,
  );
  const readOnly = [
    /^\/bin\/sh -c command -v (?:systemctl|journalctl)$/,
    /^\/usr\/bin\/systemctl show microblog --property=[A-Za-z,]+(?: --timestamp=unix)?$/,
    /^sudo -n (?:-l )?\/usr\/bin\/journalctl -u microblog --since=-6h --no-pager -o cat$/,
    /^\/usr\/bin\/journalctl -u microblog --since=-6h --no-pager -o cat$/,
  ];
  for (const call of commands.calls) expect(readOnly.some(pattern => pattern.test(call))).toBe(true);
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
  expect(calls[0].args).toContain('ServerAliveInterval=30');
  expect(calls[0].args).toContain('ServerAliveCountMax=4');
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
it.each([
  ['host', { host: '-oProxyCommand=x' }],
  ['user', { user: 'Ec2-User' }],
])('rejects an invalid %s before running ssh', async (_label, override) => {
  captureStderr();
  const runCommand = vi.fn();
  await expect(diagnoseSource({ ...sshOptions, ...override }, { runCommand })).rejects.toThrow(
    'Invalid source inputs.',
  );
  expect(runCommand).not.toHaveBeenCalled();
});
