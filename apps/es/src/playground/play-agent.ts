import { askAgent, clipText, requestBodyOf } from './agent-client.ts';
import { buildLocalAgentPrompt } from './agent-prompt.ts';
import { agentLimits, type AgentStep, type AgentTurn, type TestReport } from './agent-protocol.ts';
import { element, query } from './dom.ts';

export type AgentHost = Readonly<{
  code: () => string;
  replace: (doc: string) => void;
  runTests: () => Promise<TestReport | null>;
}>;

const passwordKey = 'es:agent:password';
const wrongPassword = 'パスワードが違います。';
const unavailable = 'いまは生成AIを使えません。ヒントと解答で進められます。';
const tooMany = '依頼が多すぎます。少し待ってからもう一度依頼してください。';
const stopped = 'ここまでで止めました。続きはもう一度依頼してください。';
const copied = 'コピーしました。';
const continueText = '続けてください。';

const readPassword = (): string | null => {
  try {
    return window.sessionStorage.getItem(passwordKey);
  } catch {
    return null;
  }
};

const writePassword = (value: string | null): void => {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(passwordKey);
    } else {
      window.sessionStorage.setItem(passwordKey, value);
    }
  } catch {
    return;
  }
};

export const mountAgent = (root: HTMLElement, step: AgentStep, host: AgentHost): void => {
  const copyButton = query<HTMLButtonElement>(root, '[data-role="agent-copy"]');
  const copiedNote = query<HTMLElement>(root, '[data-role="agent-copied"]');
  const promptBox = query<HTMLTextAreaElement>(root, '[data-role="agent-prompt"]');
  const loginForm = query<HTMLFormElement>(root, '[data-role="agent-login"]');
  const passwordInput = query<HTMLInputElement>(root, '[data-role="agent-password"]');
  const loginError = query<HTMLElement>(root, '[data-role="agent-login-error"]');
  const askForm = query<HTMLFormElement>(root, '[data-role="agent-form"]');
  const requestInput = query<HTMLTextAreaElement>(root, '[data-role="agent-request"]');
  const sendButton = query<HTMLButtonElement>(root, '[data-role="agent-send"]');
  const log = query<HTMLElement>(root, '[data-role="agent-log"]');
  const closeButton = query<HTMLElement>(root, '[data-role="agent-close"]');

  let password = readPassword();
  let conversation: readonly AgentTurn[] = [];
  let lastTests: TestReport | undefined;
  let sending = false;

  const showForm = (): void => {
    loginForm.hidden = password !== null;
    askForm.hidden = password === null;
  };

  const append = (...children: (Node | string)[]): void => {
    log.append(element('li', { className: 'play-agent-entry' }, children));
    log.scrollTop = log.scrollHeight;
  };

  const setSending = (value: boolean): void => {
    sending = value;
    requestInput.disabled = value;
    sendButton.disabled = value;
    log.setAttribute('aria-busy', String(value));
  };

  const copyPrompt = async (): Promise<void> => {
    const prompt = buildLocalAgentPrompt(step, window.location.origin);
    copiedNote.textContent = '';
    try {
      await navigator.clipboard.writeText(prompt);
      promptBox.hidden = true;
      copiedNote.textContent = copied;
    } catch {
      promptBox.value = prompt;
      promptBox.hidden = false;
      promptBox.focus();
      promptBox.select();
    }
  };

  const ask = async (request: string): Promise<boolean> => {
    let pending: readonly AgentTurn[] = [...conversation, {
      role: 'user',
      text: clipText(request, agentLimits.turnChars),
    }];
    let committed = false;
    const push = (...turns: AgentTurn[]): void => {
      pending = [...pending, ...turns];
      committed = true;
    };
    try {
      for (let call = 0; call < agentLimits.maxCalls; call += 1) {
        if (password === null) {
          return !committed;
        }
        const outcome = await askAgent(password, requestBodyOf(step, pending, host.code(), lastTests));
        if (outcome.type === 'unauthorized') {
          writePassword(null);
          password = null;
          passwordInput.value = '';
          loginError.textContent = wrongPassword;
          showForm();
          passwordInput.focus();
          return !committed;
        }
        if (outcome.type !== 'move') {
          append(outcome.type === 'rate_limited' ? tooMany : unavailable);
          return !committed;
        }
        const { move } = outcome;
        const shown = move.text.trim();
        const text = clipText(move.text, agentLimits.turnChars);
        if (shown !== '') {
          append(shown);
        }
        if (move.kind === 'message' || move.kind === 'done') {
          push({ role: 'assistant', text: text === '' ? continueText : text });
          return false;
        }
        if (move.kind === 'replace') {
          host.replace(move.code);
          append(element('code', { text: 'visits.ts' }), ' を書き換えました。');
          push({ role: 'assistant', text: `${text}\nvisits.ts を書き換えました。`.trim() }, {
            role: 'user',
            text: continueText,
          });
        } else {
          const report = await host.runTests();
          lastTests = report ?? undefined;
          append(
            report === null
              ? 'テストを実行できませんでした。'
              : `テストを実行しました。pass ${report.passed} / fail ${report.failed}`,
          );
          push({ role: 'assistant', text: 'テストを実行しました。' }, { role: 'user', text: continueText });
        }
        if (call === agentLimits.maxCalls - 1) {
          append(stopped);
        }
      }
      return false;
    } finally {
      if (committed) {
        conversation = pending;
      }
    }
  };

  copyButton.addEventListener('click', () => void copyPrompt());

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = passwordInput.value;
    if (value === '') {
      return;
    }
    password = value;
    writePassword(value);
    passwordInput.value = '';
    loginError.textContent = '';
    showForm();
    requestInput.focus();
  });

  askForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const request = requestInput.value.trim();
    if (sending || request === '') {
      return;
    }
    requestInput.value = '';
    setSending(true);
    void ask(request).catch(() => false).then((retry) => {
      setSending(false);
      if (retry) {
        requestInput.value = request;
      }
      if (!askForm.hidden) {
        requestInput.focus();
      }
    });
  });

  closeButton.addEventListener('click', () => {
    const details = closeButton.closest('details');
    if (details !== null) {
      details.open = false;
      details.querySelector('summary')?.focus();
    }
  });

  showForm();
};
