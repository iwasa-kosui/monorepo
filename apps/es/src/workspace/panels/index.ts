import type { PanelController, PanelHost, PanelMount } from '../panel';
import type { TabKind } from '../scenario';
import { mountAgent } from './agent';
import { mountDbConsole } from './db-console';
import { mountLogExplorer } from './log-explorer';

const mountStatic = (): PanelController => ({});

type PanelMounts = { readonly [K in TabKind]: PanelMount<K> };

const panelMounts: PanelMounts = {
  console: mountDbConsole,
  logs: mountLogExplorer,
  repo: mountStatic,
  agent: mountAgent,
  slot: mountStatic,
};

export const mountPanel = (host: PanelHost): PanelController => {
  const mount = panelMounts[host.tab.kind] as PanelMount;
  return mount(host);
};
