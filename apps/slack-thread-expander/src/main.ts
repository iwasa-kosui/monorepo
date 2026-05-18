import { loadConfig } from './config.ts';
import { expandChannel } from './runner.ts';

const LOCK_WAIT_MS = 0;

export const main = (): void => {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    console.log('previous tick still running; skip');
    return;
  }
  const tickStartMs = Date.now();
  try {
    const config = loadConfig();
    if (config.targetChannels.length === 0) {
      console.warn(
        'TARGET_CHANNELS is empty. Set channel IDs (comma-separated) in Script Properties.',
      );
      return;
    }
    console.log(
      `tick start: channels=[${config.targetChannels.join(',')}] selfBotId=${config.selfBotId ?? 'unset'}`,
    );
    const clients = {
      bot: { token: config.botToken },
      user: { token: config.userToken },
    };
    let totalFetched = 0;
    let totalExpanded = 0;
    let totalErrors = 0;
    let totalSkippedOwn = 0;
    let totalSkippedNoReply = 0;
    for (const channel of config.targetChannels) {
      try {
        const summary = expandChannel(clients, channel, config.selfBotId);
        totalFetched += summary.fetched;
        totalExpanded += summary.expanded;
        totalErrors += summary.errors.length;
        totalSkippedOwn += summary.skippedOwn;
        totalSkippedNoReply += summary.skippedNoReply;
        console.log(
          `[${channel}] summary: fetched=${summary.fetched} candidates=${summary.candidates} expanded=${summary.expanded} skippedOwn=${summary.skippedOwn} skippedNoReply=${summary.skippedNoReply} errors=${summary.errors.length}`,
        );
      } catch (e) {
        totalErrors += 1;
        console.error(
          `[${channel}] unexpected error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`,
        );
      }
    }
    const elapsedMs = Date.now() - tickStartMs;
    console.log(
      `tick end: channels=${config.targetChannels.length} fetched=${totalFetched} expanded=${totalExpanded} skippedOwn=${totalSkippedOwn} skippedNoReply=${totalSkippedNoReply} errors=${totalErrors} elapsedMs=${elapsedMs}`,
    );
  } finally {
    lock.releaseLock();
  }
};

export const installTrigger = (): void => {
  const existing = ScriptApp.getProjectTriggers();
  for (const trigger of existing) {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  ScriptApp.newTrigger('main').timeBased().everyMinutes(1).create();
  console.log('installed 1-minute trigger for main');
};

export const uninstallTrigger = (): void => {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  console.log('removed triggers for main');
};
