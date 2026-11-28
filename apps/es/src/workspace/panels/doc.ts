import { setAction } from '../../lesson/action-bar';
import type { PanelMount } from '../panel';
import { approvalDetail, approvalLabel, parseActionState, toggleApproval } from './approval';
import { mountChoice } from './choice';
import { watchSlotSignals } from './watch';

export const mountDoc: PanelMount<'doc'> = (host) => {
  watchSlotSignals(host);
  const button = host.panel.querySelector<HTMLButtonElement>('[data-approve]');
  if (button !== null) {
    const label = button.querySelector<HTMLElement>('[data-approve-label]');
    const origin = parseActionState(document.querySelector<HTMLElement>('[data-action-bar]')?.dataset.state);
    let approved = false;
    button.addEventListener('click', () => {
      approved = toggleApproval(approved);
      button.setAttribute('aria-pressed', String(approved));
      if (label !== null) label.textContent = approvalLabel(approved);
      setAction(approvalDetail(approved, origin));
    });
  }
  const choice = host.tab.config.choice;
  return choice === undefined ? {} : mountChoice(host, choice);
};
