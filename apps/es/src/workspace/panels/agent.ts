import { cloneFirst, must } from '../dom';
import type { PanelMount } from '../panel';
import { mountDialogue } from './agent-dialogue';

export const mountAgent: PanelMount<'agent'> = (host) => {
  const { panel } = host;
  const agent = host.scenario.agent;
  if (agent === undefined) {
    throw new Error('エージェントのタブには、筋書きの agent が必要です');
  }
  const stepsTemplate = must<HTMLTemplateElement>(panel, 'template[data-agent-steps]');
  const partsTemplate = must<HTMLTemplateElement>(panel, 'template[data-agent-parts]');
  const list = must<HTMLElement>(panel, '[data-agent-list]');
  const log = must<HTMLElement>(panel, '[data-agent-log]');
  const statusLabel = must<HTMLElement>(panel, '[data-agent-status]');
  const input = must<HTMLTextAreaElement>(panel, '[data-agent-input]');
  const send = must<HTMLButtonElement>(panel, '[data-agent-send]');
  const blocks = [...stepsTemplate.content.children];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers: number[] = [];

  const later = (ms: number, run: () => void): void => {
    if (ms === 0) {
      run();
    } else {
      timers.push(window.setTimeout(run, ms));
    }
  };
  const part = (name: string): HTMLElement => cloneFirst(partsTemplate, `[data-part="${name}"]`);
  const toEnd = (): void => {
    log.scrollTop = log.scrollHeight;
  };
  const append = (node: Node): void => {
    list.querySelector('[data-thinking]')?.remove();
    list.append(node);
    toEnd();
  };
  const thinking = (): void => {
    list.querySelector('[data-thinking]')?.remove();
    list.append(part('thinking'));
    toEnd();
  };
  const setRunning = (running: boolean): void => {
    statusLabel.dataset.state = running ? 'running' : 'done';
    statusLabel.textContent = running ? '実行中' : '完了';
    send.disabled = running;
  };
  const setToolState = (node: HTMLElement, running: boolean): void => {
    node.dataset.state = running ? 'running' : 'done';
    const body = node.querySelector<HTMLElement>('[data-tool-body]');
    if (body !== null) body.hidden = running;
    const label = node.querySelector('[data-tool-state-text]');
    if (label !== null) label.textContent = running ? '実行中' : '完了';
  };
  const complete = (): void => {
    setRunning(false);
    host.emit('agent:concluded');
  };

  const clearTimers = (): void => {
    for (const timer of timers) window.clearTimeout(timer);
    timers = [];
  };

  if (agent.decision !== undefined) {
    mountDialogue({
      host,
      decision: agent.decision,
      stepDelayMs: agent.stepDelayMs,
      reduced,
      panel,
      log,
      list,
      statusLabel,
      input,
      send,
      part,
      append,
      thinking,
      later,
    });
    return { reset: clearTimers };
  }

  const play = (): void => {
    setRunning(true);
    if (reduced) {
      for (const block of blocks) append(block.cloneNode(true));
      complete();
      return;
    }
    let elapsed = 0;
    blocks.forEach((block, index) => {
      const node = block.cloneNode(true) as HTMLElement;
      const isTool = block.getAttribute('data-kind') === 'tool';
      const last = index === blocks.length - 1;
      if (index > 0) elapsed += agent.stepDelayMs;
      later(elapsed, () => {
        if (isTool) setToolState(node, true);
        append(node);
        if (last) complete();
        else if (!isTool) thinking();
      });
      if (isTool) {
        elapsed += agent.toolDelayMs;
        later(elapsed, () => {
          setToolState(node, false);
          if (!last) thinking();
        });
      }
    });
  };

  const submit = (): void => {
    const text = input.value.trim();
    if (text === '' || send.disabled) return;
    input.value = '';
    const user = part('user');
    const userText = user.querySelector('[data-text]');
    if (userText !== null) userText.textContent = text;
    append(user);
    const answer = (): void => {
      const answerNode = part('reply');
      const answerText = answerNode.querySelector('[data-text]');
      if (answerText !== null) answerText.textContent = agent.followUp;
      append(answerNode);
      setRunning(false);
    };
    setRunning(true);
    if (reduced) {
      answer();
    } else {
      thinking();
      later(agent.stepDelayMs, answer);
    }
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submit();
  });

  play();

  return { reset: clearTimers };
};
