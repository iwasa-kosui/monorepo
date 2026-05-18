import { loadConfig } from './config.ts';
import { expandChannel } from './runner.ts';

const LOCK_WAIT_MS = 0;

export const main = (): void => {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    console.log('previous tick still running; skip');
    return;
  }
  try {
    const config = loadConfig();
    if (config.targetChannels.length === 0) {
      console.warn(
        'TARGET_CHANNELS is empty. Set channel IDs (comma-separated) in Script Properties.',
      );
      return;
    }
    const clients = {
      bot: { token: config.botToken },
      user: { token: config.userToken },
    };
    for (const channel of config.targetChannels) {
      try {
        const summary = expandChannel(clients, channel, config.selfBotId);
        console.log(
          `[${channel}] fetched=${summary.fetched} expanded=${summary.expanded} errors=${summary.errors.length}`,
        );
      } catch (e) {
        console.error(
          `[${channel}] unexpected error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`,
        );
      }
    }
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
