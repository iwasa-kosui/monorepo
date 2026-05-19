import { tickHandler } from './handler/tick-handler.ts';
import { installTriggerHandler, uninstallTriggerHandler } from './handler/trigger-handler.ts';

export const main = (): void => tickHandler();
export const installTrigger = (): void => installTriggerHandler();
export const uninstallTrigger = (): void => uninstallTriggerHandler();
