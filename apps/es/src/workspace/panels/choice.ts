import { loadChoice, saveChoice } from '../../playground/storage';
import { canConfirm, chosenDetail, restoredChoice, titleOf } from '../choice';
import { must } from '../dom';
import type { PanelController, PanelHost } from '../panel';
import type { DocChoice } from '../scenario';

export const mountChoice = (host: PanelHost<'doc'>, choice: DocChoice): PanelController => {
  const { panel, root, tab } = host;
  const radios = [...panel.querySelectorAll<HTMLInputElement>('input[data-option]')];
  const rows = [...panel.querySelectorAll<HTMLElement>('[data-option-row]')];
  const locked = [...panel.querySelectorAll<HTMLInputElement>('input[data-locked]')];
  const confirm = must<HTMLButtonElement>(panel, '[data-choose]');
  const heading = must<HTMLElement>(panel, '[data-doc-title]');
  const region = must<HTMLElement>(panel, '[data-doc-region]');
  const approve = panel.querySelector<HTMLButtonElement>('[data-approve]');
  const tabButton = root.querySelector<HTMLElement>(`[role="tab"][data-tool="${tab.key}"]`);
  const tabTitle = tabButton?.querySelector<HTMLElement>('.tab-title') ?? null;
  const ids = radios.map((radio) => radio.dataset.option ?? '');
  const adopted = radios.find((radio) => radio.dataset.adopted === 'true')?.dataset.option;
  if (radios.length === 0 || rows.length !== radios.length || adopted === undefined) {
    throw new Error('案の一覧に、案の識別子か採用された案がありません');
  }

  let chosen = restoredChoice(loadChoice(choice.id), ids);
  const selectedOption = (): string | null => radios.find((radio) => radio.checked)?.dataset.option ?? null;

  const render = (): void => {
    const confirmed = chosen !== null;
    panel.dataset.choice = confirmed ? 'confirmed' : 'pending';
    if (approve !== null) approve.hidden = !confirmed;
    for (const radio of locked) radio.disabled = !confirmed;
    radios.forEach((radio, index) => rows[index]?.toggleAttribute('data-chosen', radio.dataset.option === chosen));
    confirm.hidden = confirmed;
    confirm.disabled = !canConfirm(selectedOption(), chosen);
    const title = titleOf(tab.config.title, choice, confirmed);
    heading.textContent = title;
    region.setAttribute('aria-label', title);
    const tabText = titleOf(tab.title, choice, confirmed);
    if (tabTitle !== null) tabTitle.textContent = tabText;
    tabButton?.style.setProperty('--title-chars', String(tabText.length));
  };

  if (chosen !== null && selectedOption() === null) {
    const own = radios.find((radio) => radio.dataset.option === chosen);
    if (own !== undefined) own.checked = true;
  }
  render();

  for (const radio of radios) radio.addEventListener('change', render);
  confirm.addEventListener('click', () => {
    const selected = selectedOption();
    if (selected === null || chosen !== null) return;
    chosen = selected;
    saveChoice(choice.id, selected);
    render();
    radios.find((radio) => radio.checked)?.focus({ preventScroll: true });
    host.emit('option:chosen', chosenDetail(selected, adopted));
  });

  return {
    start: () => {
      if (chosen !== null) host.emit('option:chosen', chosenDetail(chosen, adopted));
    },
  };
};
