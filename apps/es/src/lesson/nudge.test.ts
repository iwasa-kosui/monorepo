import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  continueStall,
  isStalled,
  notifyNudge,
  NUDGE_EVENT,
  nudgeAttribute,
  placeArrow,
  stallMs,
  startStall,
} from './nudge';

const viewport = { width: 1000, height: 800 };
const arrow = { width: 48, height: 48 };
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('停滞の判定', () => {
  it('停滞までの時間は 20 秒で、属性名とイベント名を持つ', () => {
    expect(stallMs).toBe(20_000);
    expect(nudgeAttribute).toBe('data-nudge-target');
    expect(NUDGE_EVENT).toBe('lesson:nudge');
  });

  it('ステップの開始から 20 秒たつまでは、停滞とみなさない', () => {
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
    expect(placeArrow(box(400, 300, 200, 40), viewport, arrow)).toEqual({
      direction: 'down',
      left: 476,
      top: 252,
    });
  });

  it('上に収まらなければ、対象の左に置いて右向きにする', () => {
    expect(placeArrow(box(400, 10, 200, 40), viewport, arrow)).toEqual({
      direction: 'right',
      left: 352,
      top: 6,
    });
  });

  it('上と左に収まらなければ、対象の下に置いて上向きにする', () => {
    expect(placeArrow(box(0, 0, 100, 40), viewport, arrow)).toEqual({
      direction: 'up',
      left: 26,
      top: 40,
    });
  });

  it('上と左と下に収まらなければ、対象の右に置いて左向きにする', () => {
    expect(placeArrow(box(0, 0, 100, 800), viewport, arrow)).toEqual({
      direction: 'left',
      left: 100,
      top: 376,
    });
  });

  it('どこにも収まらなければ、上に置く案をビューポートの内側に寄せる', () => {
    expect(placeArrow(box(0, 0, 1000, 800), viewport, arrow)).toEqual({
      direction: 'down',
      left: 476,
      top: 0,
    });
  });

  it('対象がビューポートの上に外れていれば、上の端に固定して上向きにする', () => {
    expect(placeArrow(box(400, -300, 200, 40), viewport, arrow)).toEqual({
      direction: 'up',
      left: 476,
      top: 0,
    });
  });

  it('対象がビューポートの下に外れていれば、下の端に固定して下向きにする', () => {
    expect(placeArrow(box(400, 1200, 200, 40), viewport, arrow)).toEqual({
      direction: 'down',
      left: 476,
      top: 752,
    });
  });

  it('端に固定するときも、横はビューポートの内側に収める', () => {
    expect(placeArrow(box(960, 1200, 200, 40), viewport, arrow).left).toBe(952);
    expect(placeArrow(box(-300, -300, 100, 40), viewport, arrow).left).toBe(0);
  });

  it('対象が一部だけ見えているときは、見えている部分の中心を指す', () => {
    expect(placeArrow(box(400, 760, 200, 200), viewport, arrow)).toEqual({
      direction: 'down',
      left: 476,
      top: 712,
    });
  });
});
