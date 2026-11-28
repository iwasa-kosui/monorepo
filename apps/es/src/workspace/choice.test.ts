import { describe, expect, it } from 'vitest';

import {
  begin,
  canChoose,
  choose,
  chosenDetail,
  chosenLines,
  type Decision,
  documentTitleOf,
  fillName,
  initialDecision,
  inputOpen,
  optionLocks,
  plainName,
  presented,
  requested,
  reviewed,
  reviewLabels,
  reviewViewOf,
  shownOption,
} from './choice';
import type { AgentDecision, AgentOption, PrReviewConfig } from './scenario';

const adopted = 'append-in-update';

const sequence = { id: 's', label: 'l', lanes: [], steps: [] };
const option = (id: string, name: string): AgentOption => ({ id, name, merit: 'm', demerit: 'd', sequence });
const decision: AgentDecision = {
  request: 'r',
  drafting: 'd',
  listing: 'l',
  asking: 'a',
  choose: 'この案にする',
  options: [option(adopted, '更新処理の中で追記する'), option('add-visits-column', '`visits` に列を追加する')],
  adopted,
  first: { you: '「{name}」にします。', agent: '「{name}」を決定として ADR に書き、プルリクエストを作成しました。' },
  again: { you: '「{name}」に変更します。', agent: '決定を「{name}」に書き換えて、プルリクエストを更新しました。' },
  changesRequested: 'c',
  approved: 'a',
};

const choosing: Decision = { stage: 'choosing', submitted: [] };
const afterFirst = (option: string): Decision => reviewed(requested(choose(choosing, option), option), adopted);

describe('状態の遷移', () => {
  it('開始前から、送信で発言中になり、案を示し終えると案の選択待ちになる', () => {
    expect(initialDecision).toEqual({ stage: 'idle', submitted: [] });
    const speaking = begin(initialDecision);
    expect(speaking).toEqual({ stage: 'speaking', submitted: [] });
    expect(presented(speaking)).toEqual({ stage: 'choosing', submitted: [] });
  });

  it('開始後は、もう一度開始しても状態を変えない', () => {
    const speaking = begin(initialDecision);
    expect(begin(speaking)).toBe(speaking);
  });

  it('案を選ぶと発言中になり、プルリクエストを作成した発言の後にレビュー待ちになって、選んだ案を提出済みに加える', () => {
    const speaking = choose(choosing, 'db-feature');
    expect(speaking).toEqual({ stage: 'speaking', submitted: [] });
    expect(requested(speaking, 'db-feature')).toEqual({ stage: 'reviewing', submitted: ['db-feature'] });
  });

  it('採用案以外が選ばれたレビューの後は、発言中を経て、もう一度案の選択待ちになる', () => {
    const changes = afterFirst('db-feature');
    expect(changes).toEqual({ stage: 'speaking', submitted: ['db-feature'] });
    expect(presented(changes)).toEqual({ stage: 'choosing', submitted: ['db-feature'] });
  });

  it('選び直すと、提出済みの案が順に並び、採用案のレビューで Approved になる', () => {
    const again = presented(afterFirst('db-feature'));
    const second = requested(choose(again, 'write-to-log'), 'write-to-log');
    expect(second.submitted).toEqual(['db-feature', 'write-to-log']);
    const third = reviewed(requested(choose(presented(reviewed(second, adopted)), adopted), adopted), adopted);
    expect(third).toEqual({ stage: 'approved', submitted: ['db-feature', 'write-to-log', adopted] });
  });

  it('対応する段階でない呼び出しは、状態を変えない', () => {
    expect(presented(choosing)).toBe(choosing);
    expect(reviewed(choosing, adopted)).toBe(choosing);
    expect(requested(choosing, 'db-feature')).toBe(choosing);
    expect(choose(initialDecision, 'db-feature')).toBe(initialDecision);
  });
});

describe('canChoose と optionLocks', () => {
  it('案の選択待ちで、まだ提出していない案だけを選べる', () => {
    const changes = presented(afterFirst('db-feature'));
    expect(canChoose(changes, 'write-to-log')).toBe(true);
    expect(canChoose(changes, 'db-feature')).toBe(false);
  });

  it('案の選択待ちでなければ、どの案も選べない', () => {
    for (const stage of ['idle', 'speaking', 'reviewing', 'approved'] as const) {
      expect(canChoose({ stage, submitted: [] }, 'write-to-log'), stage).toBe(false);
    }
  });

  it('操作できない案を、案の識別子ごとに返す', () => {
    const changes = presented(afterFirst('db-feature'));
    expect(optionLocks(changes, ['db-feature', 'write-to-log'])).toEqual({ 'db-feature': true, 'write-to-log': false });
    expect(optionLocks(initialDecision, ['db-feature'])).toEqual({ 'db-feature': true });
  });
});

describe('inputOpen', () => {
  it('開始前だけ、入力欄を使える', () => {
    expect(inputOpen(initialDecision)).toBe(true);
    expect(inputOpen(begin(initialDecision))).toBe(false);
    expect(inputOpen({ stage: 'approved', submitted: [adopted] })).toBe(false);
  });
});

describe('reviewViewOf', () => {
  it('何も提出していなければ none を返し、提案している案も無い', () => {
    expect(reviewViewOf(choosing, adopted)).toEqual({
      state: 'none',
      reviewed: [],
      requested: [],
      proposed: null,
      approved: false,
    });
  });

  it('提出して待っている間は requested を返し、いま提出した案のレビューを含めない', () => {
    const waiting = requested(choose(presented(afterFirst('db-feature')), 'write-to-log'), 'write-to-log');
    expect(reviewViewOf(waiting, adopted)).toEqual({
      state: 'requested',
      reviewed: ['db-feature'],
      requested: ['db-feature'],
      proposed: 'write-to-log',
      approved: false,
    });
  });

  it('採用案以外のレビューの後は changes-requested を返し、その案を Changes requested にする', () => {
    const view = reviewViewOf(afterFirst('db-feature'), adopted);
    expect(view.state).toBe('changes-requested');
    expect(view.requested).toEqual(['db-feature']);
    expect(view.proposed).toBe('db-feature');
  });

  it('採用案のレビューの後は approved を返す', () => {
    const view = reviewViewOf(afterFirst(adopted), adopted);
    expect(view).toEqual({ state: 'approved', reviewed: [adopted], requested: [], proposed: adopted, approved: true });
  });

  it('状態の表示は、Review requested、Changes requested、Approved の文言である', () => {
    expect(reviewLabels).toEqual({
      requested: 'Review requested',
      'changes-requested': 'Changes requested',
      approved: 'Approved',
    });
  });
});

describe('shownOption', () => {
  it('Approved の前は最後に提出した案を、Approved の後は採用案を返す', () => {
    expect(shownOption(choosing, adopted)).toBeNull();
    expect(shownOption(afterFirst('db-feature'), adopted)).toBe('db-feature');
    expect(shownOption(afterFirst(adopted), adopted)).toBe(adopted);
  });
});

describe('発言の文面', () => {
  const [first, second] = decision.options;
  if (first === undefined || second === undefined) throw new Error('案がありません');

  it('最初の選択の発言を返す', () => {
    expect(chosenLines(decision, first, [])).toEqual({
      you: '「更新処理の中で追記する」にします。',
      agent: '「更新処理の中で追記する」を決定として ADR に書き、プルリクエストを作成しました。',
    });
  });

  it('選び直しの発言は、変更と更新を伝える', () => {
    expect(chosenLines(decision, first, ['db-feature'])).toEqual({
      you: '「更新処理の中で追記する」に変更します。',
      agent: '決定を「更新処理の中で追記する」に書き換えて、プルリクエストを更新しました。',
    });
  });

  it('案の名前のバッククォートを取り除いて、文面に入れる', () => {
    expect(plainName('`visits` に列を追加する')).toBe('visits に列を追加する');
    expect(chosenLines(decision, second, []).you).toBe('「visits に列を追加する」にします。');
    expect(fillName('{name}と{name}', 'x')).toBe('xとx');
  });
});

describe('chosenDetail', () => {
  it('合図のキーに、選んだ案の識別子を入れる', () => {
    expect(chosenDetail('db-feature')).toEqual({ key: 'db-feature' });
  });
});

describe('documentTitleOf', () => {
  const review: PrReviewConfig = {
    file: 'docs/adr/x.md',
    author: 'you',
    reviewer: 'colleague',
    documentTitle: '本来の表題',
    pendingTitle: '選ぶ前の表題',
    draftLabel: '叩き台',
    description: '決定は「{name}」です。',
    changeCommit: '決定を「{name}」に変更',
    appendCommit: '決定と結果を追記',
    comments: {},
  };

  it('Approved の前は、決定の内容を含まない表題を、後は本来の表題を返す', () => {
    expect(documentTitleOf(review, false)).toBe('選ぶ前の表題');
    expect(documentTitleOf(review, true)).toBe('本来の表題');
  });
});
