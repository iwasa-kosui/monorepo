import {
  canSubmit,
  chosenDetail,
  draftDelayMs,
  drafted,
  draftStage,
  emptyReview,
  requestedOf,
  reviewDelayMs,
  reviewLabels,
  reviewState,
  shownReview,
  submit,
  titleOf,
} from '../choice';
import { must } from '../dom';
import type { PanelController, PanelHost } from '../panel';
import type { DocChoice } from '../scenario';

export const mountChoice = (host: PanelHost<'doc'>, choice: DocChoice): PanelController => {
  const { panel, root, tab } = host;
  const radios = [...panel.querySelectorAll<HTMLInputElement>('input[data-option]')];
  const rows = [...panel.querySelectorAll<HTMLElement>('[data-option-row]')];
  const locked = [...panel.querySelectorAll<HTMLInputElement>('input[data-locked]')];
  const items = [...panel.querySelectorAll<HTMLElement>('[data-review-option]')];
  const confirm = must<HTMLButtonElement>(panel, '[data-choose]');
  const heading = must<HTMLElement>(panel, '[data-doc-title]');
  const region = must<HTMLElement>(panel, '[data-doc-region]');
  const draftLabel = must<HTMLElement>(panel, '[data-doc-draft]');
  const draftButton = must<HTMLButtonElement>(panel, '[data-draft-button]');
  const draftStatus = must<HTMLElement>(panel, '[data-draft-status]');
  const status = must<HTMLElement>(panel, '[data-review]');
  const statusLabel = must<HTMLElement>(panel, '[data-review-label]');
  const list = must<HTMLElement>(panel, '[data-reviews]');
  const tabButton = root.querySelector<HTMLElement>(`[role="tab"][data-tool="${tab.key}"]`);
  const tabTitle = tabButton?.querySelector<HTMLElement>('.tab-title') ?? null;
  const adopted = radios.find((radio) => radio.dataset.adopted === 'true')?.dataset.option;
  if (radios.length === 0 || rows.length !== radios.length || adopted === undefined) {
    throw new Error('案の一覧に、案の識別子か採用された案がありません');
  }

  let review = emptyReview;
  let making = false;
  let waiting = false;
  let listed = '';
  const selectedOption = (): string | null => radios.find((radio) => radio.checked)?.dataset.option ?? null;
  const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const itemOf = (id: string | undefined): HTMLElement | undefined =>
    items.find((item) => item.dataset.reviewOption === id);

  const render = (): void => {
    const shown = shownReview(review, waiting);
    const approved = shown.approved;
    const requested = requestedOf(shown, adopted);
    const state = reviewState(review, waiting);
    const stage = draftStage(review, making);
    panel.dataset.choice = approved ? 'confirmed' : 'pending';
    panel.dataset.draft = stage;
    region.setAttribute('aria-busy', String(making));
    draftButton.disabled = stage !== 'none';
    draftStatus.textContent = making ? '叩き台を作成中' : '';
    draftLabel.hidden = stage !== 'made' || approved;
    for (const radio of locked) radio.disabled = !approved;
    radios.forEach((radio, index) => {
      const id = radio.dataset.option;
      rows[index]?.toggleAttribute('data-requested', id !== undefined && requested.includes(id));
      rows[index]?.toggleAttribute('data-chosen', approved && id === adopted);
    });
    confirm.hidden = approved;
    confirm.disabled = !canSubmit(selectedOption(), review, waiting);
    status.hidden = state === 'none';
    status.dataset.state = state;
    statusLabel.textContent = state === 'none' ? '' : reviewLabels[state];
    if (listed !== shown.submitted.join(',')) {
      listed = shown.submitted.join(',');
      for (const item of items) item.hidden = !shown.submitted.includes(item.dataset.reviewOption ?? '');
      for (const id of shown.submitted) {
        const item = itemOf(id);
        if (item !== undefined) list.append(item);
      }
    }
    const title = titleOf(tab.config.title, choice, approved);
    heading.textContent = title;
    region.setAttribute('aria-label', title);
    const tabText = titleOf(tab.title, choice, approved);
    if (tabTitle !== null) tabTitle.textContent = tabText;
    tabButton?.style.setProperty('--title-chars', String(tabText.length));
  };

  render();

  for (const radio of radios) radio.addEventListener('change', render);

  draftButton.addEventListener('click', () => {
    if (making || review.drafted) return;
    making = true;
    render();
    window.setTimeout(() => {
      making = false;
      review = drafted(review);
      render();
      region.focus({ preventScroll: true });
    }, draftDelayMs);
  });

  confirm.addEventListener('click', () => {
    const selected = selectedOption();
    if (selected === null || !canSubmit(selected, review, waiting)) return;
    review = submit(review, selected, adopted);
    waiting = true;
    render();
    radios.find((radio) => radio.checked)?.focus({ preventScroll: true });
    host.emit('option:chosen', chosenDetail(selected));
    window.setTimeout(() => {
      waiting = false;
      render();
      itemOf(selected)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      host.emit('option:reviewed', chosenDetail(selected));
    }, reviewDelayMs);
  });

  return {};
};
