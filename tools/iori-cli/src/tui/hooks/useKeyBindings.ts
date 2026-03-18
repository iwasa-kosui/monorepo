import { useInput } from 'ink';
import { useRef } from 'react';

interface KeyBindingsOptions {
  isActive: boolean;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onCompose: () => void;
  onDelete: () => void;
  onLike: () => void;
  onRepost: () => void;
  onReload: () => void;
  onQuit: () => void;
}

export function useKeyBindings(opts: KeyBindingsOptions): void {
  const pendingG = useRef(false);

  useInput((input, key) => {
    if (!opts.isActive) return;

    if (pendingG.current) {
      pendingG.current = false;
      if (input === 'g') {
        opts.onReload();
        return;
      }
    }

    if (input === 'j' || key.downArrow) {
      opts.onMoveDown();
    } else if (input === 'k' || key.upArrow) {
      opts.onMoveUp();
    } else if (input === 'a') {
      opts.onCompose();
    } else if (input === 'd') {
      opts.onDelete();
    } else if (input === 'L') {
      opts.onLike();
    } else if (input === 'R') {
      opts.onRepost();
    } else if (input === 'g') {
      pendingG.current = true;
    } else if (input === 'q') {
      opts.onQuit();
    }
  });
}
