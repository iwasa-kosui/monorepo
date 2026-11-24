import type { TabDefinition, TabKind, WorkspaceScenario } from './scenario';

export type PanelProps = {
  scenario: WorkspaceScenario;
  tab: TabDefinition;
  hidden: boolean;
};

export const tabIdOf = (scenario: WorkspaceScenario, key: string): string => `${scenario.id}-tab-${key}`;

export const panelIdOf = (scenario: WorkspaceScenario, key: string): string => `${scenario.id}-panel-${key}`;

export const chatTabIdOf = (scenario: WorkspaceScenario): string => `${scenario.id}-chat-tab`;

export const chatPanelIdOf = (scenario: WorkspaceScenario): string => `${scenario.id}-chat`;

export const expectTab = <K extends TabKind>(tab: TabDefinition, kind: K): Extract<TabDefinition, { kind: K }> => {
  if (tab.kind !== kind) {
    throw new Error(`タブ ${tab.key} の種類は ${tab.kind} で、${kind} ではありません`);
  }
  return tab as Extract<TabDefinition, { kind: K }>;
};
