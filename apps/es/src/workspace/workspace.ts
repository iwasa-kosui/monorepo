import { createChat } from './chat';
import { clockOf, formatElapsed } from './clock';
import { hasFired, keyOf, record } from './conditions';
import { emitSignal, type PanelController } from './panel';
import { mountPanel } from './panels';
import { interimText, type MemoOverride, memoViews, replyGate } from './rules';
import {
  type ButtonName,
  type SignalDetail,
  signalEventName,
  type SignalName,
  type TabAction,
  type TabDefinition,
  type TabKind,
  tabOfKind,
  type TimelineEvent,
  type WorkspaceScenario,
} from './scenario';
import { createScheduler, type Recurring, type ScheduledItem, tickMs, type WaitingItem } from './scheduler';
import { createTabs } from './tabs';

export const mountWorkspace = (root: HTMLElement): void => {
  const scenario = JSON.parse(root.dataset.scenario ?? 'null') as WorkspaceScenario;
  const timed = scenario.mode === 'timed';
  const firstTab = scenario.tabs.find((tab) => tab.initial !== false);
  if (firstTab === undefined) {
    throw new Error('最初から表示するタブがありません');
  }
  const selfActor = Object.entries(scenario.actors).find(([, actor]) => actor.self === true)?.[0] ?? '';

  const startPanel = root.querySelector<HTMLElement>('[data-start]');
  const startButton = root.querySelector<HTMLButtonElement>('[data-action="start"]');
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-action="pause"]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-action="reset"]');
  const elapsedText = root.querySelector<HTMLElement>('[data-elapsed]');
  const clockText = root.querySelector<HTMLElement>('[data-clock]');
  const affectedText = root.querySelector<HTMLElement>('[data-affected]');
  const windows = [...root.querySelectorAll<HTMLElement>('[data-window]')];

  const fired = new Map<SignalName, Set<string>>();
  const controllers = new Map<string, PanelController>();
  const state = {
    selected: firstTab.key,
    opened: [] as string[],
    forcedUnseen: new Set<string>(),
    replied: false,
    counter: scenario.status.counter?.initial ?? 0,
    unlocked: new Set<ButtonName>(),
    memoOverrides: new Map<string, MemoOverride>(),
  };
  let intervalId: number | undefined;

  const emit = (name: SignalName, data?: Readonly<Record<string, unknown>>): void => emitSignal(root, name, data);

  const chat = createChat(root, scenario);

  const recurring: Recurring[] = scenario.tabs.flatMap((tab) =>
    tab.kind === 'logs'
      ? tab.config.rules.map((rule, index) => ({
        everyMs: rule.everySeconds * 1000,
        run: (count: number) => controllers.get(tab.key)?.rule?.(index, count),
      }))
      : []
  );

  const stopInterval = (): void => {
    window.clearInterval(intervalId);
    intervalId = undefined;
  };

  const updatePanels = (): void => {
    for (const controller of controllers.values()) {
      controller.update?.({ status: scheduler.status(), elapsedMs: scheduler.elapsedMs() });
    }
  };

  const renderClock = (): void => {
    const ms = scheduler.elapsedMs();
    if (elapsedText !== null) elapsedText.textContent = formatElapsed(ms);
    if (clockText !== null) clockText.textContent = clockOf(scenario.startedAt + ms);
    if (affectedText !== null) {
      affectedText.textContent = `${state.counter}${scenario.status.counter?.unit ?? ''}`;
    }
  };

  function render(): void {
    const status = scheduler.status();
    const gate = replyGate(scenario.gates, fired);
    const started = status === 'running' || status === 'paused';
    root.dataset.opened = state.opened.join(' ');
    root.dataset.selected = state.selected;
    root.dataset.ready = String(gate.ready);
    root.dataset.phase = status === 'idle'
      ? 'idle'
      : status === 'ended'
      ? 'ended'
      : status === 'paused'
      ? 'paused'
      : state.replied
      ? 'replied'
      : 'running';
    if (startPanel !== null) startPanel.hidden = status !== 'idle';
    for (const element of windows) {
      element.inert = status === 'idle';
    }
    if (pauseButton !== null) {
      pauseButton.textContent = status === 'paused' ? '再開する' : '一時停止';
      pauseButton.disabled = !started;
    }
    if (resetButton !== null) resetButton.disabled = status === 'idle';
    const unseen = new Set([
      ...scenario.tabs.flatMap((tab) => tab.seen !== undefined && !state.opened.includes(tab.key) ? [tab.key] : []),
      ...state.forcedUnseen,
    ]);
    tabs.sync({ selected: state.selected, unseen });
    chat.render({
      started,
      replied: state.replied,
      ready: gate.ready,
      reason: gate.reason,
      memo: scenario.memo === undefined ? [] : memoViews(scenario.memo, fired, state.memoOverrides),
      answerRequested: fired.has('agent:requested'),
      unlocked: state.unlocked,
    });
    updatePanels();
    renderClock();
  }

  const startInterval = (): void => {
    stopInterval();
    intervalId = window.setInterval(() => scheduler.tick(), tickMs);
  };

  const scheduler = createScheduler({
    now: () => Date.now(),
    recurring,
    onStatus: (status) => {
      if (status === 'running') startInterval();
      else stopInterval();
      render();
    },
    onTick: () => {
      updatePanels();
      renderClock();
    },
  });

  const choose = (key: string): void => {
    state.forcedUnseen.delete(key);
    state.selected = key;
    emit('tab:selected', { key });
  };

  const mountController = (tab: TabDefinition, panel: HTMLElement): void => {
    controllers.set(
      tab.key,
      mountPanel({
        root,
        panel,
        scenario,
        tab,
        emit: (name, data) => emitSignal(panel, name, data),
        elapsedMs: () => scheduler.elapsedMs(),
      }),
    );
  };

  const tabs = createTabs(root, { choose });

  const controllerOf = (kind: TabKind, key?: string): PanelController | undefined => {
    const tab = tabOfKind(scenario, kind, key);
    return tab === undefined ? undefined : controllers.get(tab.key);
  };

  const applyTab = (key: string, action: TabAction): void => {
    const definition = scenario.tabs.find((tab) => tab.key === key);
    if (definition === undefined) return;
    if (action === 'unseen') {
      state.forcedUnseen.add(key);
      render();
      return;
    }
    const panel = tabs.add(key);
    if (panel !== null) mountController(definition, panel);
    if (action === 'open') choose(key);
    else render();
  };

  const perform = (event: TimelineEvent, atMs: number): void => {
    switch (event.kind) {
      case 'post':
        if (event.unlessReplied === true && state.replied) return;
        chat.addPost(event.post, atMs);
        return;
      case 'log':
        controllerOf('logs', event.tab)?.perform?.(event, atMs);
        return;
      case 'sql':
        controllerOf('console', event.tab)?.perform?.(event, atMs);
        return;
      case 'affected':
        state.counter = event.count;
        return;
      case 'tab':
        applyTab(event.tab, event.action);
        return;
      case 'memo':
        state.memoOverrides.set(event.memo, { state: event.state, text: event.text });
        render();
        return;
      case 'enable':
        state.unlocked.add(event.button);
        render();
        return;
    }
  };

  const timedItems = (): ScheduledItem[] =>
    scenario.timeline.flatMap((event) => {
      const at = event.at;
      return at === undefined ? [] : [{ at: at * 1000, run: () => perform(event, at * 1000) }];
    });

  const waitingItems = (): WaitingItem[] =>
    scenario.timeline.flatMap((event) => {
      const when = event.when;
      return when === undefined ? [] : [{ when, key: event.key, run: () => perform(event, scheduler.elapsedMs()) }];
    });

  const syncOpened = (): void => {
    for (const tab of scenario.tabs) {
      if (tab.seen !== undefined && hasFired(fired, tab.seen) && !state.opened.includes(tab.key)) {
        state.opened.push(tab.key);
      }
    }
  };

  root.addEventListener(signalEventName, (event) => {
    const detail = (event as CustomEvent<SignalDetail>).detail;
    const key = keyOf(detail.data);
    record(fired, detail.name, key);
    syncOpened();
    scheduler.signal(detail.name, key);
    render();
  });

  const begin = (): void => {
    scheduler.start(timedItems(), waitingItems());
    if (timed) chat.focusFeed();
    emit('workspace:started');
  };

  const reset = (): void => {
    scheduler.reset();
    for (const controller of controllers.values()) controller.reset?.();
    for (const tab of scenario.tabs) {
      if (tab.initial === false) controllers.delete(tab.key);
    }
    tabs.removeAdded();
    fired.clear();
    state.selected = firstTab.key;
    state.opened = [];
    state.forcedUnseen.clear();
    state.replied = false;
    state.counter = scenario.status.counter?.initial ?? 0;
    state.unlocked.clear();
    state.memoOverrides.clear();
    chat.clear();
    chat.showHistory();
    render();
    if (timed) startButton?.focus();
    else begin();
  };

  const interimDone = (): void => {
    const interim = scenario.interim;
    if (interim === undefined || scenario.memo === undefined) return;
    scheduler.tick();
    const status = scheduler.status();
    if (status !== 'running' && status !== 'paused') return;
    const views = memoViews(scenario.memo, fired, state.memoOverrides);
    chat.addPost(
      { actor: selfActor, text: interimText(interim.heading, interim.unknown, interim.order, views) },
      scheduler.elapsedMs(),
    );
    emit('chat:interim-sent');
  };

  const replyDone = (): void => {
    const reply = scenario.reply;
    if (reply === undefined) return;
    scheduler.tick();
    const status = scheduler.status();
    if (status !== 'running' && status !== 'paused') return;
    const at = scheduler.elapsedMs();
    const lines = [
      reply.text,
      ...reply.additions.filter((addition) => at >= addition.after * 1000).map((addition) => addition.text),
    ];
    chat.addPost({ actor: selfActor, text: lines.join('\n') }, at);
    state.replied = true;
    let when = at;
    scheduler.schedule(
      reply.followUps.map((item, index) => {
        when += item.delay * 1000;
        const due = when;
        const last = index === reply.followUps.length - 1;
        return {
          at: due,
          run: () => {
            chat.addPost({ actor: item.actor, text: item.text }, due);
            if (last) scheduler.finish(due);
          },
        };
      }),
    );
    emit('chat:replied');
    chat.focusFeed();
  };

  chat.onAction('interim', interimDone);
  chat.onAction('reply', replyDone);
  chat.onAction('answer', () => {
    if (!fired.has('agent:requested')) emit('agent:requested');
  });
  startButton?.addEventListener('click', begin);
  pauseButton?.addEventListener(
    'click',
    () => (scheduler.status() === 'paused' ? scheduler.resume() : scheduler.pause()),
  );
  resetButton?.addEventListener('click', reset);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduler.tick();
  });
  root.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-open-tool]') : null;
    if (button === null) return;
    const key = button.dataset.openTool ?? '';
    choose(key);
    controllers.get(key)?.open?.();
  });

  for (const tab of scenario.tabs) {
    const panel = tab.initial === false ? undefined : tabs.panelOf(tab.key);
    if (panel !== undefined) mountController(tab, panel);
  }
  render();
  if (!timed) begin();
};
