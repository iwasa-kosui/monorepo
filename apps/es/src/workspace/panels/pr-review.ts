import { documentTitleOf, fillName, plainName, reviewLabels, reviewViewOf } from '../choice';
import { decisionStoreOf } from '../decision-store';
import { must } from '../dom';
import { mountOptionTabs } from '../option-tabs';
import type { PanelHost } from '../panel';
import { type PrEvent, prEventsOf } from '../pr-timeline';
import type { PrReviewConfig } from '../scenario';

export type PrReviewHooks = {
  readonly show: (view: string) => void;
  readonly part: (name: string) => HTMLElement;
};

export const mountPrReview = (host: PanelHost<'pr'>, review: PrReviewConfig, hooks: PrReviewHooks): void => {
  const { panel, root } = host;
  const adopted = host.scenario.agent?.decision?.adopted;
  const names = new Map(host.scenario.agent?.decision?.options.map((option) => [option.id, plainName(option.name)]));
  const optionsRoot = must<HTMLElement>(panel, '[data-option-tabs]');
  const tabs = mountOptionTabs(optionsRoot);
  const optionTabs = [...optionsRoot.querySelectorAll<HTMLElement>('[role="tab"][data-option-tab]')];
  const description = must<HTMLElement>(panel, '[data-pr-description]');
  const draft = must<HTMLElement>(panel, '[data-pr-draft]');
  const timeline = must<HTMLElement>(panel, '[data-pr-timeline]');
  const reviewerState = must<HTMLElement>(panel, '[data-pr-reviewer-state]');
  const documentTitle = must<HTMLElement>(panel, '[data-pr-doc-title]');
  if (adopted === undefined || optionTabs.length === 0) {
    throw new Error('案の一覧に、案の識別子か、採用された案がありません');
  }

  const store = decisionStoreOf(root);
  let rendered = 0;
  let selected: string | null = null;
  const nameOf = (id: string | null): string => (id === null ? '' : names.get(id) ?? id);
  const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nodeOf = (event: PrEvent): HTMLElement => {
    if (event.kind === 'request') return hooks.part('request');
    if (event.kind === 'commit') {
      const node = hooks.part('commit');
      const text = event.option === null ? review.appendCommit : fillName(review.changeCommit, nameOf(event.option));
      must<HTMLElement>(node, '[data-text]').textContent = text;
      return node;
    }
    const node = hooks.part('review');
    const label = must<HTMLElement>(node, '[data-label]');
    label.textContent = reviewLabels[event.state];
    label.dataset['state'] = event.state;
    must<HTMLElement>(node, '[data-target]').textContent = `「${nameOf(event.option)}」への決定のレビュー`;
    const body = must<HTMLElement>(node, '[data-body]');
    for (const paragraph of review.comments[event.option] ?? []) {
      const line = document.createElement('p');
      line.textContent = paragraph;
      body.append(line);
    }
    return node;
  };

  const render = (): void => {
    const decision = store.get();
    const view = reviewViewOf(decision, adopted);
    panel.dataset['choice'] = view.approved ? 'confirmed' : 'pending';
    draft.hidden = view.approved;
    description.textContent = fillName(review.description, nameOf(view.proposed));
    reviewerState.dataset['state'] = view.state;
    reviewerState.textContent = view.state === 'none' ? '' : reviewLabels[view.state];
    for (const optionTab of optionTabs) {
      const id = optionTab.dataset['optionTab'] ?? '';
      optionTab.toggleAttribute('data-requested', view.requested.includes(id));
      optionTab.toggleAttribute('data-chosen', id === view.proposed);
    }
    const shown = view.approved ? adopted : view.proposed;
    if (shown !== null && shown !== selected) {
      selected = shown;
      tabs.select(shown);
    }
    documentTitle.textContent = documentTitleOf(review, view.approved);
    const events = prEventsOf(decision, adopted);
    const added = events.slice(rendered);
    rendered = events.length;
    for (const event of added) timeline.append(nodeOf(event));
    if (added.length > 0) {
      hooks.show('conversation');
      timeline.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  };

  render();
  store.subscribe(render);
};
