import type { DocChoice } from './scenario';

export type Review = {
  readonly drafted: boolean;
  readonly submitted: readonly string[];
  readonly approved: boolean;
};

export type ReviewState = 'none' | 'requested' | 'changes-requested' | 'approved';

export type DraftStage = 'none' | 'making' | 'made';

export type ChosenDetail = {
  readonly key: string;
};

export const draftDelayMs = 1200;
export const reviewDelayMs = 1200;

export const reviewLabels: Readonly<Record<Exclude<ReviewState, 'none'>, string>> = {
  requested: 'Review requested',
  'changes-requested': 'Changes requested',
  approved: 'Approved',
};

export const emptyReview: Review = { drafted: false, submitted: [], approved: false };

export const draftStage = (review: Review, making: boolean): DraftStage =>
  making ? 'making' : review.drafted ? 'made' : 'none';

export const drafted = (review: Review): Review => ({ ...review, drafted: true });

export const submit = (review: Review, option: string, adopted: string): Review => ({
  drafted: true,
  submitted: [...review.submitted, option],
  approved: option === adopted,
});

export const shownReview = (review: Review, waiting: boolean): Review =>
  waiting ? { ...review, submitted: review.submitted.slice(0, -1), approved: false } : review;

export const requestedOf = (review: Review, adopted: string): readonly string[] =>
  review.submitted.filter((option) => option !== adopted);

export const reviewState = (review: Review, waiting: boolean): ReviewState =>
  waiting ? 'requested' : review.approved ? 'approved' : review.submitted.length === 0 ? 'none' : 'changes-requested';

export const canSubmit = (selected: string | null, review: Review, waiting: boolean): boolean =>
  selected !== null && review.drafted && !waiting && !review.approved && !review.submitted.includes(selected);

export const chosenDetail = (chosen: string): ChosenDetail => ({ key: chosen });

export const titleOf = (title: string, choice: DocChoice | undefined, confirmed: boolean): string =>
  choice === undefined || confirmed ? title : choice.pendingTitle;
