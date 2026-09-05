import { expect, it } from 'vitest';

import { deploySource } from '../deploy-source.mjs';
import { runSourceDeployStep } from '../source-deploy-operations.mjs';

it('blocks before any remote mutation and repeats the guard after setup delay', async () => {
  const calls: string[] = [];
  const input = { phase: 'checkout', sha: 'a'.repeat(40) };
  await expect(runSourceDeployStep(input, {
    home: '/fixture',
    uid: 1,
    inspectCheckout: async () => {},
    inspectPnpm: async () => {},
    guard: async () => {
      throw new Error('frozen');
    },
    runCommand: async () => {
      calls.push('mutation');
      return { stdout: '', stderr: '' };
    },
  })).rejects.toThrow();
  expect(calls).toEqual([]);
  let guards = 0;
  await expect(runSourceDeployStep({ ...input, phase: 'dependencies' }, {
    home: '/fixture',
    uid: 1,
    inspectCheckout: async () => {},
    inspectPnpm: async () => {},
    guard: async () => {
      if (++guards === 4) throw new Error('frozen');
    },
    runCommand: async (program, args) => {
      calls.push(`${program}:${args.join(',')}`);
      return {
        stdout: args.includes('rev-parse') ? input.sha : args.includes('--version') ? '10.12.4' : '',
        stderr: '',
      };
    },
  })).rejects.toThrow();
  expect(calls.some(call => call.includes('install'))).toBe(true);
  expect(calls.some(call => call.includes('restart'))).toBe(false);
});
it('uses the fixed Node bootstrap before exact checkout, dependency delay, dist transfer and restart', async () => {
  const calls: { program: string; args: string[]; input?: string }[] = [];
  const sha = 'a'.repeat(40);
  await deploySource({
    host: 'source.invalid',
    user: 'fixture',
    mainSha: sha,
    runId: 'deploy_1',
    identityFile: '/fixture/key',
    knownHostsFile: '/fixture/known_hosts',
  }, {
    inspectDist: async () => ({
      root: '/fixture/dist',
      manifest: { sha, files: [{ path: 'index.js', bytes: 0, sha256: 'a'.repeat(64) }] },
    }),
    checkMain: async () => {},
    sourceFactory: async () => ({
      status: async () => ({
        source_revision: sha,
        ingress_frozen: false,
        consumer_paused: false,
        queue_failed: false,
        identity: null,
        http_inflight: 1,
        queue_depth: 1,
        dequeue_work: 1,
        enqueue_work: 0,
        drained: false,
      }),
    }),
    runCommand: async (program, args, options) => {
      calls.push({ program, args, input: options.input });
      return { stdout: '', stderr: '' };
    },
  });
  const rsync = calls.findIndex(call => call.program === 'rsync');
  expect(rsync).toBe(4);
  expect(calls[0].args.slice(-3)).toEqual(['"$HOME/.nvm/versions/node/v24.12.0/bin/node"', '--input-type=module', '-']);
  expect(calls[rsync].args.at(-1)).toBe('source.invalid:monorepo/apps/iori/dist/');
  expect(calls[rsync].args).toContain('--delete');
  expect(calls[rsync].args.join(' ')).toContain('StrictHostKeyChecking=yes');
  expect(calls.at(-1)?.input).toContain('"restart"');
  expect(calls.every(call => !call.args.some(arg => /env\.conf|DATABASE|ssh-keyscan/.test(arg)))).toBe(true);
});
it('resets only the reviewed SHA after fetched-main proof and never touches database configuration', async () => {
  const sha = 'a'.repeat(40);
  const calls: { program: string; args: string[] }[] = [];
  await runSourceDeployStep({ phase: 'checkout', sha }, {
    home: '/fixture',
    uid: 1,
    guard: async () => {},
    inspectCheckout: async () => {},
    inspectPnpm: async () => {},
    runCommand: async (program, args) => {
      calls.push({ program, args });
      return {
        stdout: args.includes('rev-parse')
          ? sha
          : args.includes('get-url')
          ? 'git@github.com:iwasa-kosui/monorepo.git'
          : '',
        stderr: '',
      };
    },
  });
  expect(calls.find(call => call.args.includes('reset'))?.args).toEqual([
    '-C',
    '/fixture/monorepo',
    'reset',
    '--hard',
    sha,
  ]);
  expect(JSON.stringify(calls)).not.toMatch(/drizzle|DATABASE|env\.conf|clean|secret/);
});
it.each(['rsync', 'verify-dist'])('never installs or restarts after %s failure', async failure => {
  const calls: string[] = [];
  const sha = 'a'.repeat(40);
  await expect(
    deploySource({
      host: 'source.invalid',
      user: 'fixture',
      mainSha: sha,
      runId: 'deploy_1',
      identityFile: '/fixture/key',
      knownHostsFile: '/fixture/known_hosts',
    }, {
      inspectDist: async () => ({
        root: '/fixture/dist',
        manifest: { sha, files: [{ path: 'index.js', bytes: 0, sha256: 'a'.repeat(64) }] },
      }),
      checkMain: async () => {},
      sourceFactory: async () => ({
        status: async () => {
          throw new Error('must not reach readiness');
        },
      }),
      runCommand: async (program, _args, options) => {
        const phase = program === 'rsync' ? 'rsync' : /"?phase"?: "([a-z-]+)"/.exec(options.input ?? '')?.[1] ?? '';
        calls.push(phase);
        if (phase === failure) throw new Error('synthetic failure');
        return { stdout: '', stderr: '' };
      },
    }),
  ).rejects.toThrow('synthetic failure');
  expect(calls).not.toContain('install');
  expect(calls).not.toContain('restart');
});
