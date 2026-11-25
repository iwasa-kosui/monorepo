import { mountShore } from './mount';

/**
 * ページにある海辺（[data-shore-hero]）を描き始める。
 * トップページのヒーローと、記事のタイトルの帯で共有する。読み込むだけで働き、何度読み込んでも 1 度だけ登録する。
 */

let dispose: (() => void) | undefined;

const mount = (): void => {
  dispose?.();
  dispose = undefined;
  const hero = document.querySelector<HTMLElement>('[data-shore-hero]');
  const canvas = hero?.querySelector<HTMLCanvasElement>('[data-shore-canvas]');
  const slot = hero?.querySelector<HTMLElement>('[data-shore-slot]');
  const button = hero?.querySelector<HTMLButtonElement>('[data-shore-shrimp]');
  const content = hero?.querySelector<HTMLElement>('[data-shore-content]');
  if (!hero || !canvas || !slot || !button) return;
  dispose = mountShore({
    hero,
    canvas,
    slot,
    button,
    ...(content ? { content } : {}),
  });
};

document.addEventListener('astro:page-load', mount);
document.addEventListener('astro:before-swap', () => {
  dispose?.();
  dispose = undefined;
});
