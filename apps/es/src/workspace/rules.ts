import { type FiredSignals, isMet, unmet } from './conditions';
import type { FieldFormat, GatesConfig, MemoConfig, MemoRead, MemoState, SignalName } from './scenario';

export type LatestData = ReadonlyMap<SignalName, Readonly<Record<string, unknown>>>;

const rowOf = (data: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> => {
  const row = data?.['row'];
  return typeof row === 'object' && row !== null ? row as Readonly<Record<string, unknown>> : {};
};

export const formatField = (value: string, format: FieldFormat | undefined): string => {
  if (format === 'datetime') {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(value);
    return match === null ? value : `${match[1]} ${match[2]}`;
  }
  return value;
};

export const readField = (
  latest: LatestData,
  read: Pick<MemoRead, 'signal' | 'field' | 'format'> & { readonly labels?: Readonly<Record<string, string>> },
): string | undefined => {
  const value = rowOf(latest.get(read.signal))[read.field];
  if (typeof value !== 'string' || value === '') return undefined;
  return read.labels?.[value] ?? formatField(value, read.format);
};

export const fillTemplate = (
  template: string,
  data: Readonly<Record<string, unknown>> | undefined,
  formats: Readonly<Record<string, FieldFormat>> = {},
): string =>
  template.replace(/\{(\w+)\}/g, (whole, field: string) => {
    const value = rowOf(data)[field];
    return typeof value === 'string' ? formatField(value, formats[field]) : whole;
  });

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
  latest: LatestData = new Map(),
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
    const read = item.read === undefined ? undefined : readField(latest, item.read);
    const known = isMet(fired, item.fill) && (item.read === undefined || read !== undefined);
    return {
      key: item.key,
      label: item.label,
      state: known ? item.result : 'unknown',
      text: known ? read ?? item.text : memo.unknown,
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
  pending: string,
  order: readonly string[],
  views: readonly MemoView[],
): string => {
  const viewOf = (key: string): MemoView | undefined => views.find((item) => item.key === key);
  const known = order.flatMap((key) => {
    const view = viewOf(key);
    return view === undefined || view.state === 'unknown' ? [] : [view];
  });
  if (known.length === 0) return unknown;
  const unknownLabels = order.flatMap((key) => {
    const view = viewOf(key);
    return view !== undefined && view.state === 'unknown' ? [view.label] : [];
  });
  return [
    heading,
    ...known.map((view) => `${view.label}: ${view.text}`),
    ...(unknownLabels.length === 0 ? [] : [pending.replace('{labels}', unknownLabels.join('・'))]),
  ].join('\n');
};
