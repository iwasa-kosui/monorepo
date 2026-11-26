import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACTION_EVENT,
  actionChipLabels,
  type ActionDetail,
  type ActionView,
  applyAction,
  setAction,
  showsNext,
} from './action-bar';

const listening: ActionView = { state: 'listen', text: '講師の話を聞く', button: null };
const run = { label: 'テストを実行する', onClick: () => undefined };

describe('applyAction', () => {
  it('渡されなかった項目は、いまの値のまま残す', () => {
    expect(applyAction(listening, {})).toEqual(listening);
    expect(applyAction(listening, { state: 'do' })).toEqual({ ...listening, state: 'do' });
    expect(applyAction(listening, { text: '押します。' })).toEqual({ ...listening, text: '押します。' });
  });

  it('button を渡すと置き、null を渡すと消す', () => {
    const withButton = applyAction(listening, { button: run });
    expect(withButton.button).toBe(run);
    expect(applyAction(withButton, { state: 'done' }).button).toBe(run);
    expect(applyAction(withButton, { button: null }).button).toBeNull();
  });

  it('状態、文、ボタンを同時に書き換える', () => {
    expect(applyAction(listening, { state: 'done', text: 'できました。', button: run })).toEqual({
      state: 'done',
      text: 'できました。',
      button: run,
    });
  });
});

describe('showsNext', () => {
  it('手を動かす間だけ「次へ」を隠す', () => {
    expect(showsNext('listen')).toBe(true);
    expect(showsNext('do')).toBe(false);
    expect(showsNext('done')).toBe(true);
  });
});

describe('actionChipLabels', () => {
  it('状態ごとの札の文言を持つ', () => {
    expect(actionChipLabels).toEqual({ listen: '講義', do: 'ワーク', done: '完了' });
  });
});

describe('setAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubDocument = (readyState: DocumentReadyState): EventTarget & { readyState: DocumentReadyState } => {
    const target = Object.assign(new EventTarget(), { readyState });
    vi.stubGlobal('document', target);
    return target;
  };

  it('lesson:action の CustomEvent を document に投げる', () => {
    const target = stubDocument('complete');
    const received: ActionDetail[] = [];
    target.addEventListener(ACTION_EVENT, (event) => {
      received.push((event as CustomEvent<ActionDetail>).detail);
    });
    const detail: ActionDetail = { state: 'do', text: '押します。', button: run };
    setAction(detail);
    expect(ACTION_EVENT).toBe('lesson:action');
    expect(received).toEqual([detail]);
  });

  it('読み込み中は、DOMContentLoaded まで投げるのを待つ', () => {
    const target = stubDocument('loading');
    const received: ActionDetail[] = [];
    target.addEventListener(ACTION_EVENT, (event) => {
      received.push((event as CustomEvent<ActionDetail>).detail);
    });
    setAction({ state: 'done' });
    expect(received).toEqual([]);
    target.dispatchEvent(new Event('DOMContentLoaded'));
    expect(received).toEqual([{ state: 'done' }]);
  });
});

describe('heldAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const fresh = async (readyState: DocumentReadyState): Promise<typeof import('./action-bar')> => {
    vi.resetModules();
    vi.stubGlobal('document', Object.assign(new EventTarget(), { readyState }));
    return import('./action-bar');
  };

  it('setAction が呼ばれるまでは null を返す', async () => {
    const bar = await fresh('complete');
    expect(bar.heldAction()).toBeNull();
  });

  it('リスナーが登録される前の setAction の内容を、あとから読める', async () => {
    const bar = await fresh('loading');
    bar.setAction({ state: 'do', text: '押します。', button: run });
    expect(bar.heldAction()).toEqual({ state: 'do', text: '押します。', button: run });
  });

  it('部分更新を重ねた結果を持ち、button: null で消した状態も持つ', async () => {
    const bar = await fresh('complete');
    bar.setAction({ state: 'do', text: '押します。', button: run });
    bar.setAction({ text: '押しました。' });
    expect(bar.heldAction()).toEqual({ state: 'do', text: '押しました。', button: run });
    bar.setAction({ state: 'done', button: null });
    expect(bar.heldAction()).toEqual({ state: 'done', text: '押しました。', button: null });
  });
});
