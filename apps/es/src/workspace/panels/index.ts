import type { PanelController, PanelHost, PanelMount } from '../panel';
import type { TabKind } from '../scenario';
import { mountAgent } from './agent';
import { mountDbConsole } from './db-console';
import { mountDoc } from './doc';
import { mountEditor } from './editor';
import { mountLogExplorer } from './log-explorer';
import { mountPr } from './pr';

const mountStatic = (): PanelController => ({});

type PanelMounts = { readonly [K in TabKind]: PanelMount<K> };

const panelMounts: PanelMounts = {
  console: mountDbConsole,
  logs: mountLogExplorer,
  repo: mountStatic,
  agent: mountAgent,
  slot: mountStatic,
  editor: mountEditor,
  doc: mountDoc,
  pr: mountPr,
};

export const mountPanel = (host: PanelHost): PanelController => {
  const mount = panelMounts[host.tab.kind] as PanelMount;
  return mount(host);
};
