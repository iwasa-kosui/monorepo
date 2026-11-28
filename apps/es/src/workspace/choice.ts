import type { AgentChosenLines, AgentDecision, AgentOption, PrReviewConfig } from './scenario';

export type ReviewState = 'none' | 'requested' | 'changes-requested' | 'approved';

export type Stage = 'idle' | 'speaking' | 'choosing' | 'reviewing' | 'approved';

export type Decision = {
  readonly stage: Stage;
  readonly submitted: readonly string[];
};

export type ReviewView = {
  readonly state: ReviewState;
  readonly reviewed: readonly string[];
  readonly requested: readonly string[];
  readonly proposed: string | null;
  readonly approved: boolean;
};

export type ChosenDetail = {
  readonly key: string;
};

export const reviewDelayMs = 1200;

export const reviewLabels: Readonly<Record<Exclude<ReviewState, 'none'>, string>> = {
  requested: 'Review requested',
  'changes-requested': 'Changes requested',
  approved: 'Approved',
};

export const initialDecision: Decision = { stage: 'idle', submitted: [] };

export const begin = (decision: Decision): Decision =>
  decision.stage === 'idle' ? { ...decision, stage: 'speaking' } : decision;

export const presented = (decision: Decision): Decision =>
  decision.stage === 'speaking' ? { ...decision, stage: 'choosing' } : decision;

export const canChoose = (decision: Decision, option: string): boolean =>
  decision.stage === 'choosing' && !decision.submitted.includes(option);

export const choose = (decision: Decision, option: string): Decision =>
  canChoose(decision, option) ? { ...decision, stage: 'speaking' } : decision;

export const requested = (decision: Decision, option: string): Decision =>
  decision.stage === 'speaking' && !decision.submitted.includes(option)
    ? { stage: 'reviewing', submitted: [...decision.submitted, option] }
    : decision;

export const reviewed = (decision: Decision, adopted: string): Decision =>
  decision.stage === 'reviewing'
    ? { ...decision, stage: decision.submitted.at(-1) === adopted ? 'approved' : 'speaking' }
    : decision;

export const reviewViewOf = (decision: Decision, adopted: string): ReviewView => {
  const waiting = decision.stage === 'reviewing';
  const approved = decision.stage === 'approved';
  const reviewedOptions = waiting ? decision.submitted.slice(0, -1) : decision.submitted;
  return {
    state: waiting
      ? 'requested'
      : approved
      ? 'approved'
      : decision.submitted.length === 0
      ? 'none'
      : 'changes-requested',
    reviewed: reviewedOptions,
    requested: reviewedOptions.filter((option) => option !== adopted),
    proposed: decision.submitted.at(-1) ?? null,
    approved,
  };
};

export const shownOption = (decision: Decision, adopted: string): string | null =>
  decision.stage === 'approved' ? adopted : decision.submitted.at(-1) ?? null;

export const inputOpen = (decision: Decision): boolean => decision.stage === 'idle';

export const optionLocks = (decision: Decision, ids: readonly string[]): Readonly<Record<string, boolean>> =>
  Object.fromEntries(ids.map((id) => [id, !canChoose(decision, id)]));

export const fillName = (template: string, name: string): string => template.replaceAll('{name}', name);

export const plainName = (name: string): string => name.replaceAll('`', '');

export const chosenLines = (
  decision: AgentDecision,
  option: AgentOption,
  submitted: readonly string[],
): AgentChosenLines => {
  const lines = submitted.length === 0 ? decision.first : decision.again;
  const name = plainName(option.name);
  return { you: fillName(lines.you, name), agent: fillName(lines.agent, name) };
};

export const chosenDetail = (chosen: string): ChosenDetail => ({ key: chosen });

export const documentTitleOf = (review: PrReviewConfig, approved: boolean): string =>
  approved ? review.documentTitle : review.pendingTitle;
