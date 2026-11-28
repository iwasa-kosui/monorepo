import { cloneFirst } from '../dom';
import type { PanelMount } from '../panel';
import { mountPrReview } from './pr-review';
import { watchSlotSignals } from './watch';

export const mountPr: PanelMount<'pr'> = (host) => {
  const { panel } = host;
  const buttons = [...panel.querySelectorAll<HTMLButtonElement>('[data-pr-view]')];
  const views = [...panel.querySelectorAll<HTMLElement>('[data-pr-section]')];

  const show = (name: string): void => {
    for (const button of buttons) {
      const selected = button.dataset['prView'] === name;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const view of views) view.hidden = view.dataset['prSection'] !== name;
  };

  for (const button of buttons) {
    button.addEventListener('click', () => show(button.dataset['prView'] ?? ''));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const index = buttons.indexOf(button);
      const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
      if (next === undefined) return;
      show(next.dataset['prView'] ?? '');
      next.focus();
    });
  }

  watchSlotSignals(host);
  const review = host.tab.config.review;
  if (review !== undefined) {
    const parts = panel.querySelector<HTMLTemplateElement>('template[data-pr-parts]');
    if (parts === null) throw new Error('プルリクエストのレビューの部品が見つかりません');
    mountPrReview(host, review, { show, part: (name) => cloneFirst(parts, `[data-part="${name}"]`) });
  }
  return {};
};
