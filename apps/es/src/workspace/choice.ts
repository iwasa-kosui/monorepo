import type { DocChoice } from './scenario';

export type ChoiceOutcome = 'adopted' | 'other';

export type ChosenDetail = {
  readonly key: ChoiceOutcome;
  readonly option: string;
};

export const outcomeOf = (chosen: string, adopted: string): ChoiceOutcome => chosen === adopted ? 'adopted' : 'other';

export const chosenDetail = (chosen: string, adopted: string): ChosenDetail => ({
  key: outcomeOf(chosen, adopted),
  option: chosen,
});

export const restoredChoice = (saved: string | null, options: readonly string[]): string | null =>
  saved !== null && options.includes(saved) ? saved : null;

export const titleOf = (title: string, choice: DocChoice | undefined, confirmed: boolean): string =>
  choice === undefined || confirmed ? title : choice.pendingTitle;

export const canConfirm = (selected: string | null, chosen: string | null): boolean =>
  selected !== null && chosen === null;
