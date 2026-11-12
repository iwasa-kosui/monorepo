import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createRuntime, RuntimeScriptError } from './client.ts';
import { applyRuntimeState, element, failureElement, query } from './dom.ts';
import { createEditorState, createEditorView } from './editor.ts';
import type { RunOutcome } from './engine/types.ts';
import { clearEdits, loadEdits, saveEdits } from './storage.ts';

type Config = {
  exerciseId: string;
  step: 1 | 2;
  files: Record<string, string>;
  head: string;
  tail: string;
  initial: string;
  complete: string;
  completeStep2: string | null;
  template: string;
};

type Row = Record<string, string | number | null>;
type Snapshot = { visits: Row[]; business_events: Row[] };
type RunResult = { before: Snapshot; after: Snapshot; error: string | null };
type Filled = { key: string; label: string; value: string | null };

const editedFile = 'cancelVisit';
const chapterStartId = 'chapter-1-start';
const revealMarker = 'JSON.stringify({';
const visitId = 'visit-pochi';
const updateMarker = '\'cancelled\'';
const templateMarker = 'const cancelled =';
const blankPattern = /\/\* (?:event_name|target_id|target_type|target_state) \*\//g;
const missingText = '記録にありません';
const notRunText = 'まだ実行していません';
const pochiTest = 'キャンセルした人と理由を答えられる';

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

const isSnapshot = (value: unknown): value is Snapshot =>
  isRow(value)
  && Array.isArray(value.visits)
  && value.visits.every(isRow)
  && Array.isArray(value.business_events)
  && value.business_events.every(isRow);

const parseResult = (outcome: RunOutcome): RunResult | null => {
  const last = outcome.logs.at(-1)?.text;
  if (last === undefined) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(last);
    if (
      isRow(value) && isSnapshot(value.before) && isSnapshot(value.after)
      && (value.error === null || typeof value.error === 'string')
    ) {
      return { before: value.before, after: value.after, error: value.error };
    }
    return null;
  } catch {
    return null;
  }
};

const text = (
  value: string | number | null | undefined,
): string => (value === null || value === undefined ? 'NULL' : String(value));

const payloadOf = (row: Row): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(text(row.payload));
    return isRow(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const answersOf = (events: Row[]): Filled[] => {
  const row = events[0];
  const payload = row === undefined ? {} : payloadOf(row);
  return [
    { key: 'when', label: 'いつ', value: row === undefined ? null : nonEmpty(row.event_at) },
    { key: 'what', label: '何を', value: row === undefined ? null : nonEmpty(row.event_name) },
    { key: 'who', label: '誰が', value: nonEmpty(payload.operatedBy) },
    { key: 'why', label: 'なぜ', value: nonEmpty(payload.reason) },
  ];
};

const nextPageNote = '次のページのステップ2で、「誰が」「なぜ」を記録します。';
const changesTitle = '右の「ステップ2で変える2か所」';

const quoted = (labels: string[]): string => labels.map((label) => `「${label}」`).join('');

const mount = (root: HTMLElement): void => {
  const config = JSON.parse(root.dataset.config ?? '{}') as Config;
  const next = query<HTMLElement>(root, '[data-role="next"]');
  const message = query<HTMLElement>(root, '[data-role="message"]');
  const editorParent = query<HTMLElement>(root, '[data-role="editor"]');
  const runButton = query<HTMLButtonElement>(root, '[data-role="run"]');
  const templateButton = root.querySelector<HTMLButtonElement>('[data-role="template"]');
  const completeButton = query<HTMLButtonElement>(root, '[data-role="complete"]');
  const completeStep2Button = root.querySelector<HTMLButtonElement>('[data-role="complete-step-2"]');
  const resetButton = query<HTMLButtonElement>(root, '[data-role="reset"]');
  const restoreButton = query<HTMLButtonElement>(root, '[data-role="restore"]');
  const testsButton = query<HTMLButtonElement>(root, '[data-role="tests"]');
  const retryButton = query<HTMLButtonElement>(root, '[data-role="retry"]');
  const visitsBody = query<HTMLElement>(root, '[data-role="visits-body"]');
  const visitsBadge = query<HTMLElement>(root, '[data-role="visits-badge"]');
  const visitsCaption = query<HTMLElement>(root, '[data-role="visits-caption"]');
  const events = query<HTMLElement>(root, '[data-role="events"]');
  const eventsBadge = query<HTMLElement>(root, '[data-role="events-badge"]');
  const eventsCaption = query<HTMLElement>(root, '[data-role="events-caption"]');
  const blanks = root.querySelector<HTMLElement>('[data-role="blanks"]');
  const summary = query<HTMLElement>(root, '[data-role="summary"]');
  const failed = query<HTMLElement>(root, '[data-role="failed"]');
  const answerCells = [...root.querySelectorAll<HTMLElement>('[data-answer]')];
  root.setAttribute('data-mounted', '');

  let busy = false;
  let hasResult = false;
  let templateShown = false;
  let answersShown = false;
  let backup: string | null = null;

  const discardBackup = (): void => {
    backup = null;
    restoreButton.hidden = true;
  };

  const saved = loadEdits(config.exerciseId)[editedFile];
  const view = createEditorView(
    editorParent,
    createEditorState(saved ?? config.initial, {
      language: 'typescript',
      label: 'cancelVisit のコード',
      onChange: () => {
        persist();
        discardBackup();
        updateControls();
      },
    }),
  );
  view.dispatch({ effects: StateEffect.appendConfig.of(EditorView.lineWrapping) });

  const code = (): string => view.state.doc.toString();

  function persist(): void {
    if (code() === config.initial) {
      clearEdits(config.exerciseId);
      clearEdits(chapterStartId);
    } else {
      saveEdits(config.exerciseId, { [editedFile]: code() });
      // 第3章が参加者のコードを使うため
      saveEdits(chapterStartId, { 'visits.ts': config.head + code() + config.tail });
    }
  }

  const revealPayload = (): void => {
    if (config.step !== 2) {
      return;
    }
    const index = code().indexOf(revealMarker);
    if (index !== -1) {
      requestAnimationFrame(() => {
        view.dispatch({ effects: EditorView.scrollIntoView(index, { y: 'center' }) });
      });
    }
  };

  const setCode = (doc: string): void => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection: { anchor: 0 } });
    revealPayload();
  };

  const replaceWithBackup = (target: string): void => {
    const before = code();
    setCode(target);
    backup = before === config.initial || before === target ? null : before;
    restoreButton.hidden = backup === null;
  };

  const filesWith = (): Record<string, string> => ({
    ...config.files,
    'visits.ts': config.head + code() + config.tail,
  });

  const showBlanks = (): void => {
    if (blanks !== null) {
      blanks.hidden = !(templateShown || new RegExp(blankPattern.source).test(code()));
    }
  };

  const updateControls = (): void => {
    const idle = !busy && root.dataset.state === 'ready';
    runButton.disabled = !idle;
    testsButton.disabled = !idle;
    completeButton.disabled = !idle;
    if (completeStep2Button !== null) {
      completeStep2Button.disabled = !idle;
    }
    resetButton.disabled = !idle;
    if (templateButton !== null) {
      templateButton.disabled = !idle || code().includes(templateMarker);
    }
    showBlanks();
  };

  const say = (sentences: string[]): void => {
    next.replaceChildren(
      ...sentences.join('').split(/`([^`]+)`/).map((part, index) =>
        index % 2 === 1 ? element('code', { text: part }) : document.createTextNode(part)
      ),
    );
  };

  const stepOneUnfinished = '「ステップ1の完成コードを読み込む」を押して続けます。';
  const changeCancelVisit = `${changesTitle}のとおりに \`cancelVisit\` を変更します。`;

  const sayStart = (): void => {
    if (config.step === 2) {
      say(
        code().includes(templateMarker)
          ? [changeCancelVisit, '終わったら「ポチの来院をキャンセルする」を押します。']
          : [`ステップ1が終わっていないときは、${stepOneUnfinished}`],
      );
      return;
    }
    say([
      '「ポチの来院をキャンセルする」を押します。',
      'いまのコードで、visits と business_events がどう変わるかを見ます。',
    ]);
  };

  const clearMessage = (): void => {
    message.replaceChildren();
    message.hidden = true;
  };

  const showMessage = (...children: HTMLElement[]): void => {
    message.replaceChildren(...children);
    message.hidden = false;
  };

  const showError = (heading: string, detail: string): void => {
    showMessage(
      element('div', { className: 'playground-error', attributes: { role: 'alert' } }, [
        element('p', { text: heading }),
        element('pre', { text: detail }),
      ]),
    );
  };

  const renderVisits = (before: Row[], after: Row[], phase: 'before' | 'after'): void => {
    visitsBadge.dataset.phase = phase;
    visitsBadge.textContent = phase === 'before' ? '実行前' : '実行後';
    visitsBody.replaceChildren(...after.map((row) => {
      const old = before.find((candidate) => candidate.id === row.id);
      const changed = old !== undefined && old.status !== row.status;
      const status = element('td', { className: 'play-status-cell' }, [
        element('span', { className: 'play-new-value', text: text(row.status) }),
      ]);
      if (changed) {
        status.dataset.changed = '';
        status.dataset.old = text(old.status);
      }
      return element('tr', {}, [
        element('td', { text: text(row.id) }),
        element('td', { text: text(row.pet_name) }),
        status,
      ]);
    }));
    const target = after.find((row) => row.id === visitId) ?? after[0];
    const earlier = before.find((row) => row.id === target?.id);
    if (target === undefined) {
      visitsCaption.textContent = '行がありません。';
    } else if (phase === 'before') {
      visitsCaption.textContent = `status は ${text(target.status)} です。${notRunText}。`;
    } else if (earlier !== undefined && earlier.status !== target.status) {
      visitsCaption.textContent = `status が ${text(earlier.status)} から ${text(target.status)} に変わりました。`;
    } else {
      visitsCaption.textContent = `status は ${text(target.status)} のままです。`;
    }
  };

  const eventTable = (row: Row, added: boolean): HTMLElement => {
    const table = element('table', {
      className: 'play-table play-event',
      attributes: { 'aria-label': 'business_events の行', 'data-role': 'event-row' },
    }, [
      ...(added ? [element('caption', { text: '追加された行' })] : []),
      element(
        'tbody',
        {},
        Object.entries(row).map(([column, value]) =>
          element('tr', {}, [
            element('th', { text: column, attributes: { scope: 'row' } }),
            element('td', { text: text(value) }),
          ])
        ),
      ),
    ]);
    if (added) {
      table.dataset.new = '';
    }
    return table;
  };

  const renderEvents = (before: Row[], after: Row[], phase: 'before' | 'after'): void => {
    eventsBadge.dataset.phase = phase;
    eventsBadge.textContent = phase === 'before' ? '実行前' : '実行後';
    if (after.length === 0) {
      const empty = element('p', {
        className: 'play-empty',
        text: '行がありません',
        attributes: { 'data-role': 'events-empty' },
      });
      if (phase === 'after') {
        empty.dataset.ran = '';
      }
      events.replaceChildren(empty);
    } else {
      events.replaceChildren(...after.map((row, index) => eventTable(row, index >= before.length)));
    }
    if (phase === 'before') {
      eventsCaption.textContent = `${after.length} 行です。${notRunText}。`;
    } else if (after.length > before.length) {
      eventsCaption.textContent = `${before.length} 行から ${after.length} 行に増えました。`;
    } else {
      eventsCaption.textContent = `${after.length} 行のままです。行は増えていません。`;
    }
  };

  const renderAnswers = (rows: Row[] | null): void => {
    answersShown = rows !== null;
    const filled = rows === null ? null : answersOf(rows);
    for (const cell of answerCells) {
      const value = query<HTMLElement>(cell, '[data-role="answer-value"]');
      const answer = filled?.find((candidate) => candidate.key === cell.dataset.answer);
      delete value.dataset.filled;
      delete value.dataset.empty;
      if (answer === undefined) {
        value.textContent = notRunText;
      } else if (answer.value === null) {
        value.textContent = missingText;
        value.dataset.empty = '';
      } else {
        value.textContent = answer.value;
        value.dataset.filled = '';
      }
    }
  };

  const renderTables = (result: RunResult, phase: 'before' | 'after'): void => {
    const shown = phase === 'before' ? result.before : result.after;
    renderVisits(result.before.visits, shown.visits, phase);
    renderEvents(result.before.business_events, shown.business_events, phase);
  };

  const clearRunResult = (initial: RunResult | null): void => {
    if (initial !== null) {
      renderTables(initial, 'before');
    }
    renderAnswers(null);
  };

  const statusChanged = (result: RunResult): boolean => {
    const target = result.after.visits.find((row) => row.id === visitId) ?? result.after.visits[0];
    const earlier = result.before.visits.find((row) => row.id === target?.id);
    return target !== undefined && earlier !== undefined && earlier.status !== target.status;
  };

  const resetOutputs = (initial: RunResult | null): void => {
    clearRunResult(initial);
    summary.textContent = notRunText;
    summary.dataset.result = '';
    failed.replaceChildren();
    clearMessage();
  };

  let initialResult: RunResult | null = null;

  const runtime = createRuntime((state) => {
    applyRuntimeState(root, state);
    updateControls();
    if (state === 'ready' && !hasResult) {
      void loadInitial();
    }
  }, (detail) => {
    showMessage(failureElement(new RuntimeScriptError(detail), ''));
  });

  async function loadInitial(): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    updateControls();
    try {
      const result = parseResult(await runtime.runCode(config.files, 'play-initial.ts'));
      if (result !== null) {
        initialResult = result;
        hasResult = true;
        resetOutputs(result);
      }
    } catch (error) {
      showMessage(failureElement(error, ''));
    } finally {
      busy = false;
      updateControls();
    }
  }

  const run = async (): Promise<void> => {
    if (busy || runtime.state !== 'ready') {
      return;
    }
    busy = true;
    updateControls();
    clearMessage();
    try {
      const outcome = await runtime.runCode(filesWith(), 'play-cancel.ts');
      if (outcome.error !== null) {
        clearRunResult(initialResult);
        showError('コードを最後まで実行できませんでした', outcome.error);
        return;
      }
      const result = parseResult(outcome);
      if (result === null) {
        clearRunResult(initialResult);
        showError('実行の結果を読み取れませんでした', outcome.logs.map((line) => line.text).join('\n'));
        return;
      }
      hasResult = true;
      renderTables(result, 'after');
      renderAnswers(result.after.business_events);
      if (result.error !== null) {
        showError('cancelVisit がエラーを出しました', result.error);
        if (!statusChanged(result)) {
          say([
            'visits の status は reserved のままです。',
            ...(code().includes(templateMarker) ? ['記録を書き込めないときは、UPDATE も一緒に取り消されます。'] : []),
            'エラーの文を読んでコードを直し、もう一度押します。',
          ]);
        }
        return;
      }
      if (result.after.business_events.length > result.before.business_events.length) {
        const answers = answersOf(result.after.business_events);
        const labels = answers.filter((answer) => answer.value !== null).map((answer) => answer.label);
        const added = `business_events に ${
          result.after.business_events.length - result.before.business_events.length
        } 行増えました。`;
        const unfilled = answers.filter((answer) =>
          answer.value === null && (answer.key === 'who' || answer.key === 'why')
        )
          .map((answer) => answer.label);
        if (config.step === 2 && unfilled.length > 0) {
          say([
            added,
            `答えの欄の${quoted(unfilled)}は、まだ「${missingText}」です。`,
            '`payload` に `reason` と `operatedBy` が入っているかを見直して、もう一度押します。',
          ]);
          return;
        }
        say([added, `答えの欄の${quoted(labels)}が埋まりました。`, '「テストを実行する」を押します。']);
      } else {
        say([
          statusChanged(result)
            ? 'visits の status は変わりましたが、business_events は増えていません。'
            : 'visits の status も business_events も変わっていません。',
          code().includes(templateMarker)
            ? 'コードを見直して、もう一度押します。'
            : config.step === 2
            ? `ステップ1が終わっていないときは、${stepOneUnfinished}`
            : '「記録の雛形を UPDATE の次の行に入れる」を押します。',
        ]);
      }
    } catch (error) {
      showMessage(failureElement(error, '終わらない繰り返しがないか確かめてください'));
    } finally {
      busy = false;
      updateControls();
    }
  };

  const runTests = async (): Promise<void> => {
    if (busy || runtime.state !== 'ready') {
      return;
    }
    busy = true;
    updateControls();
    clearMessage();
    try {
      const outcome = await runtime.runCode(filesWith(), 'visits.test.ts');
      failed.replaceChildren();
      if (outcome.error !== null) {
        summary.textContent = 'テストを実行できませんでした';
        summary.dataset.result = 'error';
        showError('コードを最後まで実行できませんでした', outcome.error);
        return;
      }
      if (outcome.tests === null) {
        summary.textContent = 'テストが見つかりませんでした';
        summary.dataset.result = 'error';
        return;
      }
      const passed = outcome.tests.filter((test) => test.status === 'pass').length;
      const failures = outcome.tests.filter((test) => test.status === 'fail');
      summary.textContent = `pass ${passed} / fail ${failures.length}`;
      summary.dataset.result = failures.length === 0 ? 'pass' : 'fail';
      failed.replaceChildren(...failures.map((test) =>
        element('li', {}, [
          element('strong', { text: [...test.path, test.name].join(' > ') }),
          element('span', { text: (test.message ?? '').split('\n')[0] ?? '' }),
        ])
      ));
      if (failures.length === 0) {
        say(
          config.step === 2
            ? ['すべてのテストが成功しました。', '次のページへ進みます。']
            : ['すべてのテストが成功しました。'],
        );
      } else if (passed === 7 && failures.length === 1 && failures[0]?.name === pochiTest) {
        say(
          config.step === 2
            ? [`残りの 1 件は「${pochiTest}」です。`, `${changesTitle}のとおりに変更します。`]
            : answersShown
            ? [
              `残りの 1 件は「${pochiTest}」です。`,
              `答えの欄の${quoted(['誰が', 'なぜ'])}が「${missingText}」なのと対応しています。`,
              nextPageNote,
            ]
            : [
              `残りの 1 件は「${pochiTest}」です。`,
              `「ポチの来院をキャンセルする」を押して、答えの欄の${quoted(['誰が', 'なぜ'])}を確かめます。`,
              nextPageNote,
            ],
        );
      } else {
        say(['テストの結果に、失敗したテストの名前を出しています。', 'コードを直して、もう一度押せます。']);
      }
    } catch (error) {
      showMessage(failureElement(error, '終わらない繰り返しがないか確かめてください'));
    } finally {
      busy = false;
      updateControls();
    }
  };

  const insertRecordTemplate = (): void => {
    const doc = code();
    const marker = doc.indexOf(updateMarker);
    if (doc.includes(templateMarker) || marker === -1) {
      showError('雛形を入れる場所が見つかりません', '「最初のコードに戻す」を押してから、もう一度試してください。');
      return;
    }
    clearMessage();
    const lineEnd = view.state.doc.lineAt(marker).to;
    const insert = `\n${config.template}`;
    const first = '/* event_name */';
    const from = lineEnd + insert.indexOf(first);
    view.dispatch({
      changes: { from: lineEnd, insert },
      selection: { anchor: from, head: from + first.length },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    view.focus();
    templateShown = true;
    updateControls();
    say([
      '雛形の 4 つの空欄を、「空欄に入れる値」の表のとおりに書き換えます。',
      'Tab キーで次の空欄に移れます。',
      '終わったら「ポチの来院をキャンセルする」を押します。',
    ]);
  };

  editorParent.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const after = view.state.selection.main.to;
    const found = [...code().matchAll(blankPattern)].find((match) => match.index >= after);
    if (found === undefined) {
      return;
    }
    event.preventDefault();
    view.dispatch({
      selection: { anchor: found.index, head: found.index + found[0].length },
      effects: EditorView.scrollIntoView(found.index, { y: 'center' }),
    });
  });

  runButton.addEventListener('click', () => void run());
  testsButton.addEventListener('click', () => void runTests());
  templateButton?.addEventListener('click', insertRecordTemplate);
  completeButton.addEventListener('click', () => {
    replaceWithBackup(config.complete);
    clearMessage();
    say(
      config.step === 2
        ? ['ステップ1の完成コードを読み込みました。', changeCancelVisit]
        : ['ステップ1の完成コードを読み込みました。', '「ポチの来院をキャンセルする」を押します。'],
    );
  });
  completeStep2Button?.addEventListener('click', () => {
    replaceWithBackup(config.completeStep2 ?? config.complete);
    clearMessage();
    say([
      'ステップ2の完成コードを読み込みました。',
      '全テストが成功するコードです。第3章は自分のコードを使わなくても進められます。',
      '「ポチの来院をキャンセルする」を押します。',
    ]);
  });
  resetButton.addEventListener('click', () => {
    replaceWithBackup(config.initial);
    templateShown = false;
    resetOutputs(initialResult);
    sayStart();
    updateControls();
  });
  restoreButton.addEventListener('click', () => {
    if (backup !== null) {
      setCode(backup);
    }
    discardBackup();
    clearMessage();
    sayStart();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      const restored = loadEdits(config.exerciseId)[editedFile] ?? config.initial;
      if (restored !== code()) {
        setCode(restored);
      }
      discardBackup();
      updateControls();
    }
  });
  retryButton.addEventListener('click', () => runtime.reload());

  revealPayload();
  sayStart();
  updateControls();
};

for (const root of document.querySelectorAll<HTMLElement>('[data-play="add-record"]')) {
  mount(root);
}
