import { must } from '../dom';
import type { PanelMount } from '../panel';
import { revealOffset } from '../reveal';

export const mountDbConsole: PanelMount<'console'> = (host) => {
  const { panel } = host;
  const config = host.tab.config;
  const body = must<HTMLElement>(panel, '.db-body');
  const playground = must<HTMLElement>(panel, '[data-playground="sql"]');
  const results = must<HTMLElement>(panel, '[data-role="results"]');
  const resetSql = must<HTMLButtonElement>(panel, '[data-role="reset-sql"]');
  const restoreSql = must<HTMLButtonElement>(panel, '[data-role="restore"]');

  const setSql = (sql: string): void => {
    playground.dispatchEvent(
      new CustomEvent('playground:set-sql', { detail: { sql, run: true } }),
    );
  };

  // 狭い画面では、結果の欄がテーブルの一覧と入力欄の下に隠れる。ページ全体は動かさず、
  // パネルの中でスクロールする領域だけを動かして、結果を見えるところへ出す
  const scrollers = [playground, body];
  const revealResults = (): void => {
    for (const scroller of scrollers) {
      scroller.scrollTop += revealOffset(scroller.getBoundingClientRect(), results.getBoundingClientRect());
    }
  };

  const hint = document.createElement('p');
  hint.className = 'playground-note';
  hint.textContent = 'クエリを実行すると、結果がここに出ます。';
  const placeholder = (): void => {
    results.replaceChildren(hint);
    for (const scroller of scrollers) scroller.scrollTop = 0;
  };

  const quietEditor = (): boolean => {
    const announced = playground.querySelector('.cm-announced');
    announced?.removeAttribute('aria-live');
    return announced !== null;
  };

  const targetRow = (): Readonly<Record<string, string | null>> | undefined => {
    const target = config.target;
    if (target === undefined) return undefined;
    for (const result of results.querySelectorAll('.playground-result')) {
      const heads = [...result.querySelectorAll('thead th')].map((cell) => cell.textContent ?? '');
      if (!heads.includes(target.column)) continue;
      const body = [...result.querySelectorAll('tbody tr')];
      const statement = result.querySelector('.playground-statement code')?.textContent ?? '';
      const cellsOf = (row: Element): Element[] => [...row.querySelectorAll('td')];
      const named = body.find((row) => cellsOf(row).some((cell) => cell.textContent === target.value));
      const found = named ?? (statement.includes(target.value) ? body[0] : undefined);
      if (found === undefined) continue;
      const row: Record<string, string | null> = {};
      cellsOf(found).forEach((cell, index) => {
        row[heads[index] ?? ''] = cell.classList.contains('playground-null') ? null : cell.textContent;
      });
      const readable = (target.read ?? []).every((column) => heads.includes(column) && row[column] !== null);
      if (readable) return row;
    }
    return undefined;
  };

  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-table]')) {
    button.addEventListener('click', () => setSql(`SELECT * FROM ${button.dataset.table ?? ''};`));
  }

  if (!quietEditor()) {
    const editorWatcher = new MutationObserver(() => {
      if (quietEditor()) editorWatcher.disconnect();
    });
    editorWatcher.observe(playground, { childList: true, subtree: true });
  }
  results.removeAttribute('aria-live');
  results.setAttribute('role', 'status');
  placeholder();
  new MutationObserver(() => {
    if (!results.contains(hint)) revealResults();
    if (results.querySelector('.playground-result, .playground-error') === null) return;
    host.emit('sql:executed');
    const row = targetRow();
    if (row !== undefined) host.emit('sql:target-shown', { row });
  }).observe(results, { childList: true });

  return {
    perform: (effect) => {
      if (effect.kind !== 'sql') return;
      playground.dispatchEvent(new CustomEvent('playground:exec-sql', { detail: { sql: effect.sql } }));
    },
    open: () => {
      if (config.open !== undefined) setSql(config.open.sql);
    },
    reset: () => {
      resetSql.click();
      restoreSql.hidden = true;
      playground.dispatchEvent(new CustomEvent('playground:discard-state'));
      placeholder();
    },
  };
};
