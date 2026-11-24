import { type FiredSignals, isMet, unmet } from './conditions';
import type { GatesConfig, MemoConfig, MemoState } from './scenario';

export type MemoOverride = { readonly state: MemoState; readonly text?: string | undefined };

export type MemoView = {
  readonly key: string;
  readonly label: string;
  readonly state: MemoState;
  readonly text: string;
};

export const memoViews = (
  memo: MemoConfig,
  fired: FiredSignals,
  overrides: ReadonlyMap<string, MemoOverride>,
): MemoView[] =>
  memo.items.map((item) => {
    const override = overrides.get(item.key);
    if (override !== undefined) {
      return {
        key: item.key,
        label: item.label,
        state: override.state,
        text: override.state === 'unknown' ? memo.unknown : override.text ?? item.text,
      };
    }
    const known = isMet(fired, item.fill);
    return {
      key: item.key,
      label: item.label,
      state: known ? item.result : 'unknown',
      text: known ? item.text : memo.unknown,
    };
  });

export type ReplyGate = { readonly ready: boolean; readonly reason: string };

export const replyGate = (gates: GatesConfig | undefined, fired: FiredSignals): ReplyGate => {
  if (gates === undefined) return { ready: true, reason: '' };
  const gate = gates.reply;
  const missing = unmet(fired, gate.requires);
  const ready = (gate.bypass !== undefined && fired.has(gate.bypass)) || missing.length === 0;
  const first = missing[0];
  const reason = missing.length === gate.requires.length
    ? gate.reasons.all
    : missing.length >= 2
    ? gate.reasons.several.replace('{count}', String(missing.length))
    : first?.reason ?? gate.requires.at(-1)?.reason ?? '';
  return { ready, reason };
};

export const interimText = (
  heading: string,
  unknown: string,
  order: readonly string[],
  views: readonly MemoView[],
): string => {
  const parts = order.map((key) => {
    const view = views.find((item) => item.key === key);
    const value = view === undefined || view.state === 'unknown' ? unknown : view.text;
    return `${view?.label ?? ''}: ${value}`;
  });
  return `${heading}${parts.join(' / ')}`;
};
