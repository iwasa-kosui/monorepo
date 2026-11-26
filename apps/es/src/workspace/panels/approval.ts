import type { ActionDetail, ActionState } from '../../lesson/action-bar';

export const approvalLabels = { off: 'Approve', on: 'Approved' } as const;

export const parseActionState = (value: string | undefined): ActionState =>
  value === 'listen' || value === 'do' || value === 'done' ? value : 'listen';

export const toggleApproval = (approved: boolean): boolean => !approved;

export const approvalLabel = (approved: boolean): string => approved ? approvalLabels.on : approvalLabels.off;

export const approvalDetail = (approved: boolean, origin: ActionState): ActionDetail => ({
  state: approved ? 'done' : origin,
});
