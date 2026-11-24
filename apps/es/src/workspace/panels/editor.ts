import type { PanelMount } from '../panel';
import { watchSlotSignals } from './watch';

export const mountEditor: PanelMount<'editor'> = (host) => {
  watchSlotSignals(host);
  return {};
};
