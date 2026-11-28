import type { Effect, SignalName, TabDefinition, TabKind, WorkspaceScenario } from './scenario';
import { signalEventName } from './scenario';
import type { SchedulerStatus } from './scheduler';

export type PanelHost<K extends TabKind = TabKind> = {
  readonly root: HTMLElement;
  readonly panel: HTMLElement;
  readonly scenario: WorkspaceScenario;
  readonly tab: Extract<TabDefinition, { kind: K }>;
  readonly emit: (name: SignalName, data?: Readonly<Record<string, unknown>>) => void;
  readonly elapsedMs: () => number;
};

export type PanelUpdate = {
  readonly status: SchedulerStatus;
  readonly elapsedMs: number;
};

export type PanelController = {
  readonly perform?: (effect: Effect, atMs: number) => void;
  readonly rule?: (ruleIndex: number, count: number) => void;
  readonly update?: (state: PanelUpdate) => void;
  readonly open?: () => void;
  readonly deselect?: () => void;
  readonly reset?: () => void;
};

export type PanelMount<K extends TabKind = TabKind> = (host: PanelHost<K>) => PanelController;

export const emitSignal = (target: EventTarget, name: SignalName, data?: Readonly<Record<string, unknown>>): void => {
  target.dispatchEvent(
    new CustomEvent(signalEventName, { bubbles: true, detail: data === undefined ? { name } : { name, data } }),
  );
};
