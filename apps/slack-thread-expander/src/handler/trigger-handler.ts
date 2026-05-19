import { GasTrigger } from '../adaptor/gas/gas-trigger.ts';

export const installTriggerHandler = (): void => {
  GasTrigger.install();
  console.log('installed 1-minute trigger for main');
};

export const uninstallTriggerHandler = (): void => {
  GasTrigger.uninstall();
  console.log('removed triggers for main');
};
