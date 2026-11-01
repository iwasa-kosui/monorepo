import { lstat, readFile, statfs } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runMigrationCommand } from './migration-command.mjs';

export const activeStates = [
  'active',
  'inactive',
  'failed',
  'activating',
  'deactivating',
  'reloading',
  'maintenance',
  'refreshing',
  'other',
];
export const subStates = [
  'running',
  'dead',
  'exited',
  'failed',
  'auto-restart',
  'auto-restart-queued',
  'start',
  'start-pre',
  'start-post',
  'stop',
  'stop-sigabrt',
  'stop-sigterm',
  'stop-sigkill',
  'stop-post',
  'stop-watchdog',
  'final-sigterm',
  'final-sigkill',
  'final-watchdog',
  'condition',
  'reload',
  'reload-signal',
  'reload-notify',
  'dead-before-auto-restart',
  'failed-before-auto-restart',
  'dead-resources-pinned',
  'cleaning',
  'other',
];
export const journalClasses = [
  'none',
  'module-not-found',
  'syntax-error',
  'env-invalid',
  'port-in-use',
  'out-of-memory',
  'permission-denied',
  'database-unavailable',
  'uncaught-exception',
  'other',
  'unavailable',
];
const restartsLimit = 999_999;
const countLimit = 999_999;
const journalWindowHours = 6;
const exitLookbackLines = 30;
const journalLimitBytes = 8_000_000;
const truncationMarginBytes = 262_144;
const countClasses = [
  'module-not-found',
  'syntax-error',
  'env-invalid',
  'port-in-use',
  'out-of-memory',
  'permission-denied',
  'database-unavailable',
  'uncaught-exception',
];
const exitStatusLimit = 255;
const megabytesLimit = 999_999_999_999;
export const sourceDiagnoseNoticeLine = new RegExp(
  `^IORI_NOTICE stage=source-diagnose active=(?:${activeStates.join('|')}) sub=(?:${subStates.join('|')})`
    + ` restarts=\\d{1,6} exit_status=\\d{1,3} journal=(?:${journalClasses.join('|')}) freeze=[01] freeze_pending=[01]`
    + ' mem_available_mb=\\d{1,12} disk_free_mb=\\d{1,12} source_revision=(?:[a-f0-9]{40}|unknown)'
    + ` active_enter=(?:\\d{8}T\\d{4}Z|unknown) journal_window_h=${journalWindowHours} journal_truncated=[01]`
    + ' exits=\\d{1,6} scheduled_restarts=\\d{1,6}'
    + `${countClasses.map((name) => ` jc_${name.replaceAll('-', '_')}=\\d{1,6}`).join('')}$`,
);
const invalid = () => new Error('Invalid source diagnostic.');
const boundedInteger = (value, limit) => {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) throw invalid();
  return Math.min(Number(value), limit);
};
const vocabulary = (value, allowed) => allowed.includes(value) ? value : 'other';
export const parseSystemctlShow = (text) => {
  const properties = new Map();
  for (const line of String(text).split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0) properties.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  if (!properties.has('ActiveState') || !properties.has('SubState')) throw invalid();
  return {
    active: vocabulary(properties.get('ActiveState'), activeStates),
    sub: vocabulary(properties.get('SubState'), subStates),
    restarts: boundedInteger(properties.get('NRestarts'), restartsLimit),
    exitStatus: boundedInteger(properties.get('ExecMainStatus'), exitStatusLimit),
  };
};
const journalRules = [
  ['module-not-found', /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)/],
  ['syntax-error', /SyntaxError/],
  [
    'env-invalid',
    /Invalid environment variables|ZodError|"code":\s*"(?:invalid_type|invalid_value|invalid_format|too_small)"/,
  ],
  ['port-in-use', /EADDRINUSE|address already in use/i],
  ['out-of-memory', /JavaScript heap out of memory|\bENOMEM\b|Out of memory|oom-kill/i],
  ['permission-denied', /\bEACCES\b|\bEPERM\b|Permission denied/i],
  [
    'database-unavailable',
    /ECONNREFUSED.*(?::5432|127\.0\.0\.1|::1|localhost)|password authentication failed|the database system is|Connection terminated|too many clients already|database ".*" does not exist/i,
  ],
];
const uncaughtException = /UnhandledPromiseRejection|\bUncaught\b|^\s+at\s+\S/;
const exitLine = /Main process exited|Failed with result/;
const classifyLine = (line) => journalRules.find(([, pattern]) => pattern.test(line))?.[0];
const classifyRange = (range) => {
  for (let index = range.length - 1; index >= 0; index -= 1) {
    const name = classifyLine(range[index]);
    if (name) return name;
  }
  return range.some((line) => uncaughtException.test(line)) ? 'uncaught-exception' : 'other';
};
const emptyCounts = () => Object.fromEntries(countClasses.map((name) => [name, 0]));
export const analyzeJournal = (text) => {
  const lines = String(text).split('\n');
  const counts = emptyCounts();
  let exits = 0;
  let scheduledRestarts = 0;
  let previousExit = -1;
  let sawExit = false;
  let lastClass;
  lines.forEach((line, index) => {
    const name = classifyLine(line);
    if (name) counts[name] += 1;
    if (/Main process exited/.test(line)) exits += 1;
    if (/Scheduled restart job/.test(line)) scheduledRestarts += 1;
    if (!exitLine.test(line)) return;
    sawExit = true;
    const range = lines.slice(Math.max(previousExit + 1, index - exitLookbackLines), index);
    previousExit = index;
    if (range.length === 0) return;
    lastClass = classifyRange(range);
    if (lastClass === 'uncaught-exception') counts[lastClass] += 1;
  });
  for (const name of countClasses) counts[name] = Math.min(counts[name], countLimit);
  return {
    journal: lastClass ?? (sawExit ? 'other' : 'none'),
    exits: Math.min(exits, countLimit),
    scheduledRestarts: Math.min(scheduledRestarts, countLimit),
    counts,
  };
};
export const parseMemAvailableMegabytes = (text) => {
  const kilobytes = /^MemAvailable:\s+(\d{1,15}) kB$/m.exec(String(text))?.[1];
  if (!kilobytes) throw invalid();
  return Math.min(Math.floor(Number(kilobytes) / 1024), megabytesLimit);
};
export const parseActiveEnter = (text) => {
  const value = /^ActiveEnterTimestamp=(.*)$/m.exec(String(text))?.[1]?.trim();
  const seconds = /^@(\d{1,12})$/.exec(value ?? '')?.[1];
  if (!seconds || Number(seconds) === 0) return 'unknown';
  return `${new Date(Number(seconds) * 1000).toISOString().slice(0, 16).replace(/[-:]/g, '')}Z`;
};
export const parseSourceRevision = (text) => {
  const found = new Set([...String(text).matchAll(/["'`]([a-f0-9]{40})["'`]/g)].map((match) => match[1]));
  return found.size === 1 ? [...found][0] : 'unknown';
};
export const formatSourceDiagnoseNotice = (values) => {
  const line = `IORI_NOTICE stage=source-diagnose active=${values.active} sub=${values.sub} restarts=${values.restarts}`
    + ` exit_status=${values.exitStatus} journal=${values.journal} freeze=${values.freeze}`
    + ` freeze_pending=${values.freezePending} mem_available_mb=${values.memAvailableMegabytes}`
    + ` disk_free_mb=${values.diskFreeMegabytes} source_revision=${values.sourceRevision}`
    + ` active_enter=${values.activeEnter} journal_window_h=${journalWindowHours}`
    + ` journal_truncated=${values.journalTruncated} exits=${values.exits}`
    + ` scheduled_restarts=${values.scheduledRestarts}`
    + countClasses.map((name) => ` jc_${name.replaceAll('-', '_')}=${values.counts?.[name]}`).join('');
  if (!sourceDiagnoseNoticeLine.test(line)) throw invalid();
  return line;
};
const present = async (path) => {
  try {
    await lstat(path);
    return 1;
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
};
const distLimitBytes = 64 * 1024 * 1024;
const readSourceRevision = async (path) => {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > distLimitBytes) return 'unknown';
    return parseSourceRevision(await readFile(path, 'utf8'));
  } catch {
    return 'unknown';
  }
};
const journalArguments = ['-u', 'microblog', `--since=-${journalWindowHours}h`, '--no-pager', '-o', 'cat'];
const unreadableJournal = /insufficient permissions|not seeing messages from other users|No journal files were opened/i;
export const runSourceDiagnosis = async ({
  home = homedir(),
  meminfoPath = '/proc/meminfo',
  runCommand = runMigrationCommand,
  signal,
  write = (line) => process.stderr.write(`${line}\n`),
} = {}) => {
  const exec = (program, args, captureOutput = async () => {}) =>
    runCommand(program, args, {
      cwd: home,
      env: { ...process.env, PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      timeout: 60_000,
      maxBuffer: journalLimitBytes,
      signal,
      captureOutput,
    });
  const locate = async (name) => {
    const { stdout } = await exec('/bin/sh', ['-c', `command -v ${name}`]);
    const path = stdout.trim();
    if (!/^\/[A-Za-z0-9/_.-]+$/.test(path)) throw invalid();
    return path;
  };
  const systemctl = await locate('systemctl');
  const state = parseSystemctlShow(
    (await exec(systemctl, ['show', 'microblog', '--property=ActiveState,SubState,NRestarts,ExecMainStatus'])).stdout,
  );
  const activeEnter = await (async () => {
    try {
      return parseActiveEnter(
        (await exec(systemctl, ['show', 'microblog', '--property=ActiveEnterTimestamp', '--timestamp=unix'])).stdout,
      );
    } catch {
      signal?.throwIfAborted();
      return 'unknown';
    }
  })();
  const attemptJournal = async (program, args) => {
    let captured = '';
    try {
      return await exec(program, args, async (output) => {
        captured = output.stdout;
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (Buffer.byteLength(captured) < journalLimitBytes - truncationMarginBytes) throw error;
      return {
        stdout: captured.endsWith('\n') ? captured : captured.slice(0, captured.lastIndexOf('\n') + 1),
        stderr: '',
        truncated: 1,
      };
    }
  };
  const readJournal = async () => {
    try {
      const journalctl = await locate('journalctl');
      let result;
      try {
        await exec('sudo', ['-n', '-l', journalctl, ...journalArguments]);
        result = await attemptJournal('sudo', ['-n', journalctl, ...journalArguments]);
      } catch {
        signal?.throwIfAborted();
      }
      result ??= await attemptJournal(journalctl, journalArguments);
      if (unreadableJournal.test(result.stderr)) return { ...analyzeJournal(''), journal: 'unavailable', truncated: 0 };
      return { ...analyzeJournal(result.stdout), truncated: result.truncated ?? 0 };
    } catch {
      signal?.throwIfAborted();
      return { ...analyzeJournal(''), journal: 'unavailable', truncated: 0 };
    }
  };
  const analysis = await readJournal();
  const base = join(home, '.iori-migration');
  const filesystem = await statfs(home, { bigint: true });
  write(formatSourceDiagnoseNotice({
    ...state,
    journal: analysis.journal,
    journalTruncated: analysis.truncated,
    exits: analysis.exits,
    scheduledRestarts: analysis.scheduledRestarts,
    counts: analysis.counts,
    activeEnter,
    freeze: await present(join(base, 'freeze.json')),
    freezePending: await present(join(base, 'freeze.pending')),
    memAvailableMegabytes: parseMemAvailableMegabytes(await readFile(meminfoPath, 'utf8')),
    diskFreeMegabytes: Math.min(Number(filesystem.bavail * filesystem.bsize / 1048576n), megabytesLimit),
    sourceRevision: await readSourceRevision(join(home, 'monorepo/apps/iori/dist/index.js')),
  }));
};
