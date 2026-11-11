import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'hono/jsx';

import { type HomeItem, homeItemKey } from './homeFeed.ts';
import { type ReadingAnchor, writeHomeSnapshot } from './homeSnapshot.ts';
import {
  anchorFromRects,
  AT_TOP_THRESHOLD_PX,
  type ItemRect,
  prependedKeys,
  scrollCorrection,
} from './readingPosition.ts';
import type { TimelineData } from './useTimeline.ts';

export const ITEM_KEY_ATTRIBUTE = 'data-item-key';

const SAVE_DEBOUNCE_MS = 600;
const EMPTY: ReadonlySet<string> = new Set();

export type UseReadingPositionReturn = Readonly<{
  /** 読んでいる位置より上に届いた、まだ見ていない新着のキー。 */
  unseenKeys: ReadonlySet<string>;
  /** 先頭で読んでいるときに届いた新着のキー。登場アニメーションをかける。 */
  enteringKeys: ReadonlySet<string>;
  scrollToTop: () => void;
}>;

type UseReadingPositionProps = Readonly<{
  items: readonly HomeItem[];
  data: TimelineData | null;
  initialAnchor: ReadingAnchor | undefined;
}>;

const elementOf = (key: string): Element | null => {
  try {
    return document.querySelector(`[${ITEM_KEY_ATTRIBUTE}="${CSS.escape(key)}"]`);
  } catch {
    return null;
  }
};

const captureAnchor = (): ReadingAnchor | undefined => {
  if (window.scrollY <= AT_TOP_THRESHOLD_PX) return undefined;
  const rects: ItemRect[] = [];
  for (const element of Array.from(document.querySelectorAll(`[${ITEM_KEY_ATTRIBUTE}]`))) {
    const key = element.getAttribute(ITEM_KEY_ATTRIBUTE);
    if (key === null) continue;
    const { top, bottom } = element.getBoundingClientRect();
    rects.push({ key, top, bottom });
    if (bottom > 0) break;
  }
  return anchorFromRects(rects, window.scrollY);
};

/**
 * ホームタイムラインの「どこまで読んだか」を扱う。
 * - スクロール中は画面上端のアイテムを読み位置として覚え、localStorage に保存する
 * - 新着が先頭に差し込まれたり画像の読み込みで高さが変わっても、読み位置が動かないようにスクロールを補正する
 * - 次に開いたときは保存した読み位置まで戻す
 */
export const useReadingPosition = (
  { items, data, initialAnchor }: UseReadingPositionProps,
): UseReadingPositionReturn => {
  const anchorRef = useRef<ReadingAnchor | undefined>(initialAnchor);
  // 復元中はユーザーが操作するまで読み位置を上書きしない（描画途中の高さで別のアイテムを拾わないように）
  const isRestoringRef = useRef(initialAnchor !== undefined);
  const dataRef = useRef(data);
  dataRef.current = data;
  const previousKeysRef = useRef<readonly string[]>([]);
  const [unseenKeys, setUnseenKeys] = useState<ReadonlySet<string>>(EMPTY);
  const [enteringKeys, setEnteringKeys] = useState<ReadonlySet<string>>(EMPTY);

  const save = useCallback(() => {
    const current = dataRef.current;
    if (current === null || current === undefined) return;
    writeHomeSnapshot({
      me: current.me,
      paging: { statuses: current.statuses, nextMaxId: current.nextMaxId, bluesky: current.bluesky },
      anchor: anchorRef.current ?? undefined,
    });
  }, []);

  const applyAnchor = useCallback(() => {
    const anchor = anchorRef.current;
    if (anchor === undefined || anchor === null) return;
    const element = elementOf(anchor.key);
    if (element === null) return;
    const delta = scrollCorrection(anchor, element.getBoundingClientRect().top);
    if (delta !== 0) window.scrollBy(0, delta);
  }, []);

  useLayoutEffect(() => {
    const keys = items.map(homeItemKey);
    const prepended = prependedKeys(previousKeysRef.current ?? [], keys);
    previousKeysRef.current = keys;
    applyAnchor();
    const frame = requestAnimationFrame(applyAnchor);
    if (prepended.length > 0) {
      if (anchorRef.current === undefined || anchorRef.current === null) {
        setEnteringKeys(new Set(prepended));
      } else {
        setUnseenKeys((prev) => new Set([...prev, ...prepended]));
      }
    }
    return () => cancelAnimationFrame(frame);
  }, [items, applyAnchor]);

  useEffect(() => {
    const root = document.documentElement;
    const previousOverflowAnchor = root.style.overflowAnchor;
    // ブラウザ標準のスクロールアンカーと二重に補正しないよう、こちらで一元的に扱う
    root.style.overflowAnchor = 'none';
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';

    let frame: number | undefined;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSave = () => {
      if (saveTimer !== undefined) clearTimeout(saveTimer);
      saveTimer = setTimeout(save, SAVE_DEBOUNCE_MS);
    };

    const handleScroll = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (window.scrollY <= AT_TOP_THRESHOLD_PX) {
          setUnseenKeys((prev) => prev.size === 0 ? prev : EMPTY);
        }
        if (isRestoringRef.current === true) return;
        anchorRef.current = captureAnchor();
        scheduleSave();
      });
    };
    const handleUserInput = () => {
      isRestoringRef.current = false;
    };
    const handleHidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => applyAnchor());
    resizeObserver?.observe(document.body);

    window.addEventListener('scroll', handleScroll, { passive: true });
    for (const type of ['touchstart', 'wheel', 'keydown', 'mousedown'] as const) {
      window.addEventListener(type, handleUserInput, { passive: true });
    }
    document.addEventListener('visibilitychange', handleHidden);
    window.addEventListener('pagehide', save);

    return () => {
      root.style.overflowAnchor = previousOverflowAnchor;
      history.scrollRestoration = previousRestoration;
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (saveTimer !== undefined) clearTimeout(saveTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', handleScroll);
      for (const type of ['touchstart', 'wheel', 'keydown', 'mousedown'] as const) {
        window.removeEventListener(type, handleUserInput);
      }
      document.removeEventListener('visibilitychange', handleHidden);
      window.removeEventListener('pagehide', save);
    };
  }, [save, applyAnchor]);

  // タイムラインの中身が変わったら（新着・続きの読み込み・いいね等）保存し直す
  useEffect(() => {
    if (data === null) return;
    const timer = setTimeout(save, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [data, save]);

  const scrollToTop = useCallback(() => {
    isRestoringRef.current = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return { unseenKeys, enteringKeys, scrollToTop } as const;
};
