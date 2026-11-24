import type { PanelMount } from '../panel';
import { watchSlotSignals } from './watch';

export const mountDoc: PanelMount<'doc'> = (host) => {
  watchSlotSignals(host);
  return {};
};
