import { singleton } from '../../../helper/singleton.ts';
import { onCreate } from './onCreate.ts';
import { onDelete } from './onDelete.ts';
import { onFollow } from './onFollow.ts';
import { onLike } from './onLike.ts';
import { onUndo } from './onUndo.ts';

export const InboxListener = {
  getInstance: singleton(() => ({
    onCreate,
    onDelete,
    onFollow,
    onLike,
    onUndo,
  })),
} as const;
