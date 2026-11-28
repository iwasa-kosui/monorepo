import { describe, expect, it } from 'vitest';

import {
  canSubmit,
  chosenDetail,
  draftStage,
  emptyReview,
  requestedOf,
  reviewLabels,
  reviewState,
  shownReview,
  submit,
  titleOf,
} from './choice';

const adopted = 'append-in-update';
const made = { ...emptyReview, drafted: true };

describe('submit', () => {
  it('採用案と違う案を提出すると、Approved にならず、提出した案が順に並ぶ', () => {
    const first = submit(made, 'db-feature', adopted);
    expect(first).toEqual({ drafted: true, submitted: ['db-feature'], approved: false });
    expect(submit(first, 'write-to-log', adopted)).toEqual({
      drafted: true,
      submitted: ['db-feature', 'write-to-log'],
      approved: false,
    });
  });

  it('採用案を提出すると、Approved になる', () => {
    const second = submit(submit(made, 'db-feature', adopted), adopted, adopted);
    expect(second).toEqual({ drafted: true, submitted: ['db-feature', adopted], approved: true });
  });
});

describe('requestedOf', () => {
  it('Changes requested になった案だけを、提出した順に返す', () => {
    const review = submit(submit(submit(made, 'db-feature', adopted), 'write-to-log', adopted), adopted, adopted);
    expect(requestedOf(review, adopted)).toEqual(['db-feature', 'write-to-log']);
  });
});

describe('reviewState', () => {
  it('何も提出していなければ none、提出して待っている間は requested を返す', () => {
    expect(reviewState(made, false)).toBe('none');
    expect(reviewState(submit(made, 'db-feature', adopted), true)).toBe('requested');
    expect(reviewState(submit(made, adopted, adopted), true)).toBe('requested');
  });

  it('待っていないとき、別の案を提出済みなら changes-requested、採用案なら approved を返す', () => {
    expect(reviewState(submit(made, 'db-feature', adopted), false)).toBe('changes-requested');
    expect(reviewState(submit(made, adopted, adopted), false)).toBe('approved');
  });

  it('状態の表示は、Review requested、Changes requested、Approved の文言である', () => {
    expect(reviewLabels).toEqual({
      requested: 'Review requested',
      'changes-requested': 'Changes requested',
      approved: 'Approved',
    });
  });
});

describe('shownReview', () => {
  it('待っている間は、いま提出した案のレビューを含めず、Approved も表示しない', () => {
    const review = submit(submit(made, 'db-feature', adopted), adopted, adopted);
    expect(shownReview(review, true)).toEqual({ drafted: true, submitted: ['db-feature'], approved: false });
    expect(shownReview(review, false)).toBe(review);
  });
});

describe('canSubmit', () => {
  const requested = submit(made, 'db-feature', adopted);

  it('叩き台を作成済みで、案を選んでいて、まだ提出していなければ、提出できる', () => {
    expect(canSubmit('write-to-log', made, false)).toBe(true);
    expect(canSubmit('write-to-log', requested, false)).toBe(true);
  });

  it('案を選んでいないとき、または叩き台が無いときは、提出できない', () => {
    expect(canSubmit(null, made, false)).toBe(false);
    expect(canSubmit('write-to-log', emptyReview, false)).toBe(false);
  });

  it('Changes requested になった案は、再び提出できない', () => {
    expect(canSubmit('db-feature', requested, false)).toBe(false);
  });

  it('同僚のレビューを待っている間は、提出できない', () => {
    expect(canSubmit('write-to-log', requested, true)).toBe(false);
  });

  it('Approved の後は、どの案も提出できない', () => {
    const approved = submit(requested, adopted, adopted);
    expect(canSubmit('write-to-log', approved, false)).toBe(false);
    expect(canSubmit(adopted, approved, false)).toBe(false);
  });
});

describe('draftStage', () => {
  it('作成中なら making、作成済みなら made、どちらでもなければ none を返す', () => {
    expect(draftStage(emptyReview, false)).toBe('none');
    expect(draftStage(emptyReview, true)).toBe('making');
    expect(draftStage(made, false)).toBe('made');
  });
});

describe('chosenDetail', () => {
  it('合図のキーに、選んだ案の識別子を入れる', () => {
    expect(chosenDetail('db-feature')).toEqual({ key: 'db-feature' });
  });
});

describe('titleOf', () => {
  const choice = { pendingTitle: '選ぶ前の表題', draftLabel: '叩き台' };

  it('案を選ぶ設定が無いか、選び終えたあとは、本来の表題を返す', () => {
    expect(titleOf('本来の表題', undefined, false)).toBe('本来の表題');
    expect(titleOf('本来の表題', choice, true)).toBe('本来の表題');
  });

  it('案を選ぶ前は、決定の内容を含まない表題を返す', () => {
    expect(titleOf('本来の表題', choice, false)).toBe('選ぶ前の表題');
  });
});
