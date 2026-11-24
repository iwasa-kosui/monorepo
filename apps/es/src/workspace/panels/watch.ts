import type { PanelHost } from '../panel';

type SlotHost = Pick<PanelHost, 'panel' | 'emit'>;

const summaryPattern = /^pass (\d+) \/ fail (\d+)$/;
const figureSelector = '[data-transaction-figure], [data-event-row-figure], [data-before-record-figure]';

const reportTests = (host: SlotHost, text: string): void => {
  const match = summaryPattern.exec(text.trim());
  if (match === null) return;
  const data = { pass: Number(match[1]), fail: Number(match[2]) };
  host.emit('tests:ran', data);
  if (data.fail === 0 && data.pass > 0) host.emit('tests:passed', data);
};

const watchTests = (host: SlotHost): void => {
  const { panel } = host;
  for (const output of panel.querySelectorAll<HTMLElement>('[data-role="output"]')) {
    new MutationObserver(() => {
      const summary = output.querySelector('[data-role="summary"]');
      if (summary !== null) reportTests(host, summary.textContent ?? '');
    }).observe(output, { childList: true });
  }
  for (const summary of panel.querySelectorAll<HTMLElement>('[data-play] [data-role="summary"]')) {
    new MutationObserver(() => reportTests(host, summary.textContent ?? '')).observe(summary, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
};

const watchRuns = (host: SlotHost): void => {
  host.panel.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button === null || button.disabled) return;
    const runsCode = button.matches('[data-run-file]:not([data-role="run-tests"])')
      || button.matches('[data-play] [data-role="run"]');
    if (runsCode) host.emit('code:run');
  }, true);
};

const watchFigures = (host: SlotHost): void => {
  for (const figure of host.panel.querySelectorAll<HTMLElement>(figureSelector)) {
    const next = figure.querySelector<HTMLButtonElement>('[data-action="next"]');
    new MutationObserver(() => {
      const step = Number(figure.dataset['step'] ?? '0');
      const last = next?.disabled === true;
      host.emit('figure:step', { key: last ? 'last' : String(step), step, last });
    }).observe(figure, { attributes: true, attributeFilter: ['data-step'] });
  }
};

export const watchSlotSignals = (host: SlotHost): void => {
  watchTests(host);
  watchRuns(host);
  watchFigures(host);
};
