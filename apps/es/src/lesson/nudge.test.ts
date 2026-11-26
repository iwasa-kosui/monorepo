import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  continueStall,
  frameSizeOf,
  isStalled,
  notifyNudge,
  NUDGE_EVENT,
  nudgeAttribute,
  nudgeLabelOf,
  nudgeMessageOf,
  nudgeTextAttribute,
  placeArrow,
  stallMs,
  startStall,
} from './nudge';

const viewport = { width: 1000, height: 800 };
const wide = { width: 1280, height: 800 };
const arrow = { width: 48, height: 48 };
const sizeOf = () => arrow;
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('停滞の判定', () => {
  it('属性名とイベント名を持つ', () => {
    expect(nudgeAttribute).toBe('data-nudge-target');
    expect(nudgeTextAttribute).toBe('data-nudge-text');
    expect(NUDGE_EVENT).toBe('lesson:nudge');
  });

  it('ステップの開始から判定時間がたつまでは、停滞とみなさない', () => {
    const stall = startStall('button', 'do', 1_000);
    expect(isStalled(stall, 1_000)).toBe(false);
    expect(isStalled(stall, 1_000 + stallMs - 1)).toBe(false);
    expect(isStalled(stall, 1_000 + stallMs)).toBe(true);
  });

  it('次の操作の対象がないあいだは、いくら時間がたっても停滞とみなさない', () => {
    const stall = startStall(null, 'do', 0);
    expect(isStalled(stall, stallMs * 10)).toBe(false);
  });

  it('対象も帯の状態も同じなら、同じステップが続く', () => {
    const stall = startStall('button', 'do', 0);
    expect(continueStall(stall, 'button', 'do', 30_000)).toBe(stall);
  });

  it('対象が別の要素に変わると、新しいステップが始まり、計測を 0 から再開する', () => {
    const stall = startStall('button', 'do', 0);
    const next = continueStall(stall, 'tab', 'do', stallMs);
    expect(next).toEqual({ target: 'tab', state: 'do', since: stallMs });
    expect(isStalled(next, stallMs)).toBe(false);
  });

  it('帯の状態が変わると、対象が同じでも新しいステップが始まる', () => {
    const stall = startStall('button', 'do', 0);
    const next = continueStall(stall, 'button', 'done', stallMs);
    expect(next).toEqual({ target: 'button', state: 'done', since: stallMs });
  });

  it('対象が null になると、新しいステップが始まる', () => {
    const stall = startStall('button', 'do', 0);
    expect(continueStall(stall, null, 'do', 5_000)).toEqual({ target: null, state: 'do', since: 5_000 });
  });
});

describe('notifyNudge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lesson:nudge の CustomEvent を document に投げる', () => {
    const target = new EventTarget();
    vi.stubGlobal('document', target);
    const received: Event[] = [];
    target.addEventListener(NUDGE_EVENT, (event) => received.push(event));
    notifyNudge();
    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(CustomEvent);
  });
});

describe('placeArrow', () => {
  it('ビューポートに余白があれば、対象の上に置いて下向きにする', () => {
    expect(placeArrow(box(400, 300, 200, 40), viewport, sizeOf)).toEqual({
      direction: 'down',
      left: 476,
      top: 252,
      arrowOffset: 24,
    });
  });

  it('上に収まらなければ、対象の下に置いて上向きにする', () => {
    expect(placeArrow(box(400, 10, 200, 40), viewport, sizeOf)).toEqual({
      direction: 'up',
      left: 476,
      top: 50,
      arrowOffset: 24,
    });
  });

  it('上と下に収まらなければ、対象の左に置いて右向きにする', () => {
    expect(placeArrow(box(500, 0, 200, 800), viewport, sizeOf)).toEqual({
      direction: 'right',
      left: 452,
      top: 376,
      arrowOffset: 24,
    });
  });

  it('避ける矩形を渡さなければ、上に置く', () => {
    expect(placeArrow(box(400, 300, 200, 40), viewport, sizeOf, 0, []).direction).toBe('down');
  });

  it('上の案が避ける矩形と重なるときは、下に置いて上向きにする', () => {
    const avoid = [box(0, 200, 1000, 100)];
    expect(placeArrow(box(400, 300, 200, 40), viewport, sizeOf, 0, avoid)).toEqual({
      direction: 'up',
      left: 476,
      top: 340,
      arrowOffset: 24,
    });
  });

  it('上と下の案が避ける矩形と重なるときは、左に置いて右向きにする', () => {
    const avoid = [box(440, 200, 120, 100), box(440, 380, 120, 100)];
    expect(placeArrow(box(400, 300, 200, 40), viewport, sizeOf, 0, avoid).direction).toBe('right');
  });

  it('避ける矩形と辺が接するだけなら、重なりとみなさない', () => {
    const avoid = [box(0, 200, 1000, 52)];
    expect(placeArrow(box(400, 300, 200, 40), viewport, sizeOf, 0, avoid).direction).toBe('down');
  });

  it('すべての案が避ける矩形と重なるときは、上に置く案をビューポートの内側に寄せる', () => {
    const avoid = [box(0, 0, 1000, 800)];
    expect(placeArrow(box(400, 300, 200, 40), viewport, sizeOf, 0, avoid)).toEqual({
      direction: 'down',
      left: 476,
      top: 252,
      arrowOffset: 24,
    });
  });

  it('上と下と左に収まらなければ、対象の右に置いて左向きにする', () => {
    expect(placeArrow(box(0, 0, 100, 800), viewport, sizeOf)).toEqual({
      direction: 'left',
      left: 100,
      top: 376,
      arrowOffset: 24,
    });
  });

  it('どこにも収まらなければ、上に置く案をビューポートの内側に寄せる', () => {
    expect(placeArrow(box(0, 0, 1000, 800), viewport, sizeOf)).toEqual({
      direction: 'down',
      left: 476,
      top: 0,
      arrowOffset: 24,
    });
  });

  it('対象がビューポートの上に外れていれば、上の端に固定して上向きにする', () => {
    expect(placeArrow(box(400, -300, 200, 40), viewport, sizeOf)).toEqual({
      direction: 'up',
      left: 476,
      top: 0,
      arrowOffset: 24,
    });
  });

  it('対象がビューポートの下に外れていれば、下の端に固定して下向きにする', () => {
    expect(placeArrow(box(400, 1200, 200, 40), viewport, sizeOf)).toEqual({
      direction: 'down',
      left: 476,
      top: 752,
      arrowOffset: 24,
    });
  });

  it('端に固定するときも、横はビューポートの内側に収める', () => {
    expect(placeArrow(box(960, 1200, 200, 40), viewport, sizeOf).left).toBe(952);
    expect(placeArrow(box(-300, -300, 100, 40), viewport, sizeOf).left).toBe(0);
  });

  it('対象が一部だけ見えているときは、見えている部分の中心を指す', () => {
    expect(placeArrow(box(400, 760, 200, 200), viewport, sizeOf)).toEqual({
      direction: 'down',
      left: 476,
      top: 712,
      arrowOffset: 24,
    });
  });
});

describe('placeArrow の矢印の位置', () => {
  const frame = { width: 200, height: 80 };
  const frameOf = () => frame;

  it('外枠が右端に寄せられても、矢印は対象の中心を指す', () => {
    const placement = placeArrow(box(940, 1200, 40, 40), viewport, frameOf);
    expect(placement.direction).toBe('down');
    expect(placement.left).toBe(800);
    expect(placement.left + placement.arrowOffset).toBe(960);
  });

  it('外枠が左端に寄せられても、矢印は対象の中心を指す', () => {
    const placement = placeArrow(box(10, -300, 40, 40), viewport, frameOf);
    expect(placement.direction).toBe('up');
    expect(placement.left).toBe(0);
    expect(placement.left + placement.arrowOffset).toBe(30);
  });

  it('どこにも収まらないときも、矢印は対象の中心を指す', () => {
    const placement = placeArrow(box(100, 0, 900, 800), viewport, frameOf);
    expect(placement.direction).toBe('down');
    expect(placement.left + placement.arrowOffset).toBe(550);
  });

  it('下の案が横にはみ出すときは、外枠を内側に寄せて下に置き、矢印は対象の中心を指す', () => {
    const sizeByDirection = (direction: string) =>
      direction === 'up' || direction === 'down' ? { width: 340, height: 80 } : { width: 384, height: 40 };
    const placement = placeArrow(box(975, 74, 273, 44), wide, sizeByDirection);
    expect(placement.direction).toBe('up');
    expect(placement.top).toBe(118);
    expect(placement.left + 340).toBeLessThanOrEqual(wide.width);
    expect(placement.left + placement.arrowOffset).toBe(1111.5);
    expect(placeArrow(box(975, 74, 273, 44), wide, sizeByDirection, 20).left).toBe(940);
  });

  it('左と右の案は、外枠を縦に寄せてから収まるかを判定する', () => {
    const placement = placeArrow(
      box(500, 700, 200, 100),
      viewport,
      (direction) =>
        direction === 'up' || direction === 'down' ? { width: 100, height: 900 } : { width: 100, height: 300 },
    );
    expect(placement.direction).toBe('right');
    expect(placement.top).toBe(500);
    expect(placement.top + placement.arrowOffset).toBe(750);
  });

  it('外枠の幅がビューポートの幅を超えるときは、寄せても採用しない', () => {
    const placement = placeArrow(
      box(400, 300, 200, 40),
      viewport,
      (direction) =>
        direction === 'down' || direction === 'up' ? { width: 1200, height: 80 } : { width: 100, height: 40 },
    );
    expect(placement.direction).toBe('right');
  });

  it('寄せた後の位置で、避ける矩形との重なりを判定する', () => {
    const sizeOfFrame = () => ({ width: 340, height: 80 });
    const target = box(975, 400, 273, 44);
    expect(placeArrow(target, wide, sizeOfFrame, 0, [box(1200, 310, 80, 80)]).direction).toBe('up');
    expect(placeArrow(target, wide, sizeOfFrame, 0, [box(1280.5, 310, 10, 80)]).direction).toBe('down');
  });

  it('矢印の位置は、外枠の角から余白の分だけ内側に収める', () => {
    expect(placeArrow(box(980, 1200, 20, 40), viewport, frameOf, 20).arrowOffset).toBe(180);
    expect(placeArrow(box(0, -300, 10, 40), viewport, frameOf, 20).arrowOffset).toBe(20);
  });

  it('外枠が余白の 2 倍より小さければ、矢印は外枠の中央に置く', () => {
    expect(placeArrow(box(400, 300, 200, 40), viewport, () => ({ width: 30, height: 30 }), 20).arrowOffset).toBe(15);
  });

  it('向きごとに異なる外枠の大きさで置く', () => {
    const placement = placeArrow(
      box(400, 300, 200, 40),
      viewport,
      (direction) => direction === 'down' ? { width: 100, height: 120 } : { width: 10, height: 10 },
    );
    expect(placement).toEqual({ direction: 'down', left: 450, top: 180, arrowOffset: 50 });
  });
});

describe('frameSizeOf', () => {
  const bubble = { width: 200, height: 40 };
  const tip = { width: 40, height: 40 };

  it('上下向きは縦に並べ、左右向きは横に並べた大きさになる', () => {
    expect(frameSizeOf('down', bubble, tip)).toEqual({ width: 200, height: 80 });
    expect(frameSizeOf('up', bubble, tip)).toEqual({ width: 200, height: 80 });
    expect(frameSizeOf('left', bubble, tip)).toEqual({ width: 240, height: 40 });
    expect(frameSizeOf('right', bubble, tip)).toEqual({ width: 240, height: 40 });
  });

  it('吹き出しがないときは、矢印の大きさが外枠の大きさになる', () => {
    expect(frameSizeOf('down', { width: 0, height: 0 }, tip)).toEqual({ width: 40, height: 40 });
    expect(frameSizeOf('right', { width: 0, height: 0 }, tip)).toEqual({ width: 40, height: 40 });
  });
});

describe('nudgeLabelOf', () => {
  it('表示テキストの前後の空白を除き、連続する空白を 1 つにまとめる', () => {
    expect(nudgeLabelOf('  実行\n  する  ', 'ラベル')).toBe('実行 する');
  });

  it('表示テキストが空なら aria-label を使う', () => {
    expect(nudgeLabelOf(' \n ', '  閉じる ')).toBe('閉じる');
  });

  it('data-nudge-label があれば、表示テキストと aria-label より優先する', () => {
    expect(nudgeLabelOf('実行する', '実行', '  チャット ')).toBe('チャット');
    expect(nudgeLabelOf('', 'チャット（未読 2 件）', 'チャット')).toBe('チャット');
  });

  it('data-nudge-label が空なら、表示テキストと aria-label の規則に戻る', () => {
    expect(nudgeLabelOf('実行する', null, '  ')).toBe('実行する');
    expect(nudgeLabelOf('', '閉じる', '')).toBe('閉じる');
  });

  it('どちらも空なら空文字を返す', () => {
    expect(nudgeLabelOf('', null)).toBe('');
    expect(nudgeLabelOf('  ', '  ')).toBe('');
  });
});

describe('nudgeMessageOf', () => {
  it('タブは「<ラベル>」のタブを開きます', () => {
    expect(nudgeMessageOf('tab', 'ログ')).toBe('「ログ」のタブを開きます');
  });

  it('入力欄はラベルによらず「この欄に入力します」', () => {
    expect(nudgeMessageOf('input', '質問')).toBe('この欄に入力します');
    expect(nudgeMessageOf('input', '')).toBe('この欄に入力します');
  });

  it('それ以外は「<ラベル>」を押します', () => {
    expect(nudgeMessageOf('press', '実行する')).toBe('「実行する」を押します');
  });

  it('ラベルが空のタブとボタンは、文を返さない', () => {
    expect(nudgeMessageOf('tab', '')).toBe('');
    expect(nudgeMessageOf('press', '')).toBe('');
  });

  it('対象ごとの文があれば、種類とラベルによらずその文をそのまま返す', () => {
    expect(nudgeMessageOf('press', '実行する', 'この行を開きます')).toBe('この行を開きます');
    expect(nudgeMessageOf('tab', 'ログ', ' 文 ')).toBe(' 文 ');
    expect(nudgeMessageOf('input', '', '検索欄を「service:clinic-api」に戻します')).toBe(
      '検索欄を「service:clinic-api」に戻します',
    );
    expect(nudgeMessageOf('press', '', 'この行を開きます')).toBe('この行を開きます');
  });

  it('対象ごとの文が null か空なら、種類とラベルの規則に戻る', () => {
    expect(nudgeMessageOf('press', '実行する', null)).toBe('「実行する」を押します');
    expect(nudgeMessageOf('press', '実行する', '')).toBe('「実行する」を押します');
    expect(nudgeMessageOf('tab', 'ログ', '')).toBe('「ログ」のタブを開きます');
  });
});
