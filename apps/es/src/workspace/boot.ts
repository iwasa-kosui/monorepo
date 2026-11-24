import { mountWorkspace } from './workspace';

export const bootWorkspaces = (): void => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-scenario]')) {
    mountWorkspace(root);
  }
};
