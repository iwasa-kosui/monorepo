import { type FiredSignals, isMet, unmet } from './conditions';
import { replyGate } from './rules';
import type { Condition, GatesConfig, SignalName, SignalRef, TabDefinition } from './scenario';

export type NudgeSpec =
  | { readonly tab: string; readonly text?: string }
  | { readonly selector: string; readonly text?: string };

export type LogFacetView = {
  readonly value: string;
  readonly checked: boolean;
  readonly name: string;
  readonly group: string;
};

export type LogView = {
  readonly shownRows: number;
  readonly targetShown: boolean;
  readonly facet: LogFacetView | null;
  readonly initialQuery: string;
};

export type NudgeContext = {
  readonly tabs: readonly Pick<TabDefinition, 'key' | 'kind'>[];
  readonly selected: string;
  readonly logs?: LogView;
  readonly restoreRunShown?: boolean;
  readonly sqlMissed?: boolean;
  readonly resetSqlShown?: boolean;
  readonly live?: { readonly channel: string; readonly shown: boolean; readonly written: boolean };
};

export const restoredKey = 'restored';

export const restoreSelector = '[data-restore]';

export const restorePlaygroundSelector = '[data-backup-restore] [data-playground="sql"]';

export const restoreRunSelector = `${restorePlaygroundSelector} [data-role="run"]`;

export const resetSqlSelector = '[data-playground="sql"] [data-role="reset-sql"]';

export const liveInputSelector = '[data-live-input]';

export const liveSendSelector = '[data-action="send"]';

export const fewLogRows = 3;

export const signalSelectors: Readonly<Partial<Record<SignalName, string>>> = {
  'sql:executed': '[data-playground="sql"] [data-role="run"]',
  'sql:target-shown': '[data-playground="sql"] [data-role="run"]',
  'tests:ran': '[data-role="run-tests"]',
  'tests:passed': '[data-role="run-tests"]',
  'code:run': '[data-run-file]:not([data-role="run-tests"]), [data-play] [data-role="run"]',
  'figure:step': '[data-before-record-figure] [data-action="next"]',
  'question:written': liveInputSelector,
};

export const unmetSignals = (fired: FiredSignals, condition: Condition): SignalRef[] => {
  if (isMet(fired, condition)) return [];
  if (typeof condition === 'string' || 'name' in condition) return [condition];
  const items = 'all' in condition ? condition.all : condition.any;
  return items.flatMap((item) => unmetSignals(fired, item));
};

export const nextSignals = (
  fired: FiredSignals,
  gates: GatesConfig | undefined,
  done: Condition | undefined,
): SignalRef[] => {
  if (gates !== undefined && !replyGate(gates, fired).ready) {
    return unmet(fired, gates.reply.requires).map((requirement) => requirement.signal);
  }
  return done === undefined ? [] : unmetSignals(fired, done);
};

const quoted = (value: string): string => value.replace(/["\\]/g, '\\$&');

const logNudgeOf = (key: string, view: LogView): NudgeSpec => {
  const panel = `[role="tabpanel"][data-tool="${quoted(key)}"]`;
  const row = { selector: `${panel} tr[data-log-row][data-cancel="true"]:not([hidden])`, text: 'この行を開きます' };
  if (view.targetShown && view.shownRows <= fewLogRows) return row;
  if (view.facet !== null && !view.facet.checked) {
    return {
      selector: `${panel} label.facet-item:has(input[type="checkbox"][data-facet="method"][value="${
        quoted(view.facet.value)
      }"])`,
      text: `${view.facet.group} の「${view.facet.name}」を選びます`,
    };
  }
  if (view.targetShown) return row;
  return { selector: `${panel} input[data-query]`, text: `検索欄を「${view.initialQuery}」に戻します` };
};

export const nudgeSpecOf = (signal: SignalRef, context: NudgeContext): NudgeSpec | null => {
  const name = typeof signal === 'string' ? signal : signal.name;
  const key = typeof signal === 'string' ? undefined : signal.key;
  if (name === 'tab:selected') return key === undefined ? null : { tab: key };
  if (name === 'sql:executed' && key === restoredKey) {
    return { selector: context.restoreRunShown === true ? restoreRunSelector : restoreSelector };
  }
  if (name === 'sql:target-shown' && context.sqlMissed === true && context.resetSqlShown === true) {
    return { selector: resetSqlSelector };
  }
  if (name === 'log:detail-opened' || name === 'log:target-opened') {
    const logs = context.tabs.find((tab) => tab.kind === 'logs');
    if (logs === undefined) return null;
    if (logs.key !== context.selected) return { tab: logs.key };
    return context.logs === undefined ? null : logNudgeOf(logs.key, context.logs);
  }
  if (name === 'question:written' && context.live !== undefined) {
    if (!context.live.shown) return { selector: `button[data-channel="${quoted(context.live.channel)}"]` };
    return { selector: context.live.written ? liveSendSelector : liveInputSelector };
  }
  const selector = signalSelectors[name];
  return selector === undefined ? null : { selector };
};
