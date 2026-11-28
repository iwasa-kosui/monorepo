import {
  begin,
  canChoose,
  choose,
  chosenDetail,
  chosenLines,
  type Decision,
  inputOpen,
  optionLocks,
  presented,
  requested,
  reviewDelayMs,
  reviewed,
  type Stage,
} from '../choice';
import { decisionStoreOf } from '../decision-store';
import { must } from '../dom';
import { mountOptionTabs } from '../option-tabs';
import type { PanelHost } from '../panel';
import type { AgentDecision } from '../scenario';

export type DialogueContext = {
  readonly host: PanelHost<'agent'>;
  readonly decision: AgentDecision;
  readonly stepDelayMs: number;
  readonly reduced: boolean;
  readonly panel: HTMLElement;
  readonly log: HTMLElement;
  readonly list: HTMLElement;
  readonly statusLabel: HTMLElement;
  readonly input: HTMLTextAreaElement;
  readonly send: HTMLButtonElement;
  readonly part: (name: string) => HTMLElement;
  readonly append: (node: Node) => void;
  readonly thinking: () => void;
  readonly later: (ms: number, run: () => void) => void;
};

type Status = { readonly state: 'running' | 'waiting' | 'done'; readonly text: string };

export const statusOf = (stage: Stage): Status =>
  stage === 'speaking'
    ? { state: 'running', text: '実行中' }
    : stage === 'approved'
    ? { state: 'done', text: '完了' }
    : { state: 'waiting', text: '待機中' };

const setText = (node: HTMLElement, text: string): void => {
  const target = node.querySelector('[data-text]');
  if (target !== null) target.textContent = text;
};

export const mountDialogue = (context: DialogueContext): void => {
  const { host, decision, panel, log, list, statusLabel, input, send, part, append, thinking, later } = context;
  const store = decisionStoreOf(host.root);
  const options = new Map(decision.options.map((option) => [option.id, option]));
  let anchor: HTMLElement | null = null;

  const alignTo = (node: HTMLElement): void => {
    log.scrollTop += node.getBoundingClientRect().top - log.getBoundingClientRect().top;
  };
  const lists = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>('[data-agent-options]')];

  const renderLists = (decisionNow: Decision): void => {
    const all = lists();
    all.forEach((item, index) => {
      const latest = index === all.length - 1;
      item.toggleAttribute('data-active', latest);
      const ids = [...item.querySelectorAll<HTMLElement>('[data-option-choose]')].map((button) =>
        button.dataset.optionChoose ?? ''
      );
      const locks = optionLocks(decisionNow, ids);
      for (const button of item.querySelectorAll<HTMLButtonElement>('[data-option-choose]')) {
        button.disabled = !latest || locks[button.dataset.optionChoose ?? ''] !== false;
      }
    });
  };

  const render = (): void => {
    const decisionNow = store.get();
    const status = statusOf(decisionNow.stage);
    statusLabel.dataset.state = status.state;
    statusLabel.textContent = status.text;
    input.disabled = !inputOpen(decisionNow);
    send.disabled = !inputOpen(decisionNow) || input.value.trim() === '';
    renderLists(decisionNow);
  };

  const say = (text: string): HTMLElement => {
    const node = part('reply');
    setText(node, text);
    append(node);
    return node;
  };

  const youSay = (text: string): void => {
    const node = part('user');
    setText(node, text);
    append(node);
  };

  const after = (run: () => void): void => {
    if (context.reduced) {
      run();
      return;
    }
    thinking();
    later(context.stepDelayMs, run);
  };

  const inOrder = (actions: readonly (() => void)[], finish: () => void): void => {
    const [action, ...rest] = actions;
    if (action === undefined) {
      finish();
      return;
    }
    after(() => {
      action();
      inOrder(rest, finish);
    });
  };

  const showOptions = (lead: string | null): void => {
    const node = part('options');
    const leadNode = node.querySelector<HTMLElement>('[data-text]');
    if (lead === null) leadNode?.remove();
    else setText(node, lead);
    const submitted = store.get().submitted;
    const tabs = mountOptionTabs(must(node, '[data-option-tabs]'));
    let first: string | null = null;
    for (const tab of node.querySelectorAll<HTMLElement>('[role="tab"][data-option-tab]')) {
      const id = tab.dataset.optionTab ?? '';
      const done = submitted.includes(id);
      tab.toggleAttribute('data-requested', done);
      if (done) {
        const button = node.querySelector<HTMLElement>(`[data-option-choose="${id}"]`);
        if (button !== null) button.hidden = true;
      } else if (first === null) {
        first = id;
      }
    }
    if (first !== null) tabs.select(first);
    append(node);
    renderLists(store.get());
    alignTo(node);
  };

  const review = (option: string): void => {
    store.set(reviewed(store.get(), decision.adopted));
    host.emit('option:reviewed', chosenDetail(option));
    if (store.get().stage === 'approved') {
      anchor = null;
      say(decision.approved);
      return;
    }
    const lead = say(decision.changesRequested);
    anchor = lead;
    after(() => {
      showOptions(null);
      store.set(presented(store.get()));
      alignTo(lead);
    });
  };

  const pick = (id: string): void => {
    const option = options.get(id);
    if (option === undefined || !canChoose(store.get(), id)) return;
    const lines = chosenLines(decision, option, store.get().submitted);
    store.set(choose(store.get(), id));
    anchor = null;
    youSay(lines.you);
    after(() => {
      say(lines.agent);
      store.set(requested(store.get(), id));
      host.emit('option:chosen', chosenDetail(id));
      later(reviewDelayMs, () => review(id));
    });
  };

  const submit = (): void => {
    const text = input.value.trim();
    if (text === '' || !inputOpen(store.get())) return;
    input.value = '';
    store.set(begin(store.get()));
    youSay(text);
    inOrder(
      [
        () => {
          say(decision.drafting);
        },
        () => showOptions(decision.listing),
        () => {
          say(decision.asking);
        },
      ],
      () => {
        store.set(presented(store.get()));
        const latest = lists().at(-1);
        if (latest !== undefined) alignTo(latest);
      },
    );
  };

  send.addEventListener('click', submit);
  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submit();
  });
  list.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-option-choose]') : null;
    if (button !== null) pick(button.dataset.optionChoose ?? '');
  });
  new MutationObserver(() => {
    if (panel.hidden) return;
    if (anchor === null) log.scrollTop = log.scrollHeight;
    else alignTo(anchor);
  }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });

  store.subscribe(render);
  render();
};
