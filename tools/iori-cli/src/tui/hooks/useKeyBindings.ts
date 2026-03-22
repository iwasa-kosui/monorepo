import { useInput } from 'ink';
import { useRef } from 'react';

interface KeyBindingsOptions {
  isActive: boolean;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onPageForward: () => void;
  onPageBack: () => void;
  onCompose: () => void;
  onEditorCompose: () => void;
  onDelete: () => void;
  onLike: () => void;
  onRepost: () => void;
  onReload: () => void;
  onTabSwitch: () => void;
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
    } else if (input === 'e') {
      opts.onEditorCompose();
    } else if (input === 'a') {
      opts.onCompose();
    } else if (input === 'd') {
      opts.onDelete();
    } else if (input === 'L') {
      opts.onLike();
    } else if (input === 'R') {
      opts.onRepost();
    } else if (input === 'h' || key.leftArrow) {
      opts.onPageBack();
    } else if (input === 'l' || key.rightArrow) {
      opts.onPageForward();
    } else if (input === 'g') {
      pendingG.current = true;
    } else if (key.tab) {
      opts.onTabSwitch();
    } else if (input === 'q') {
      opts.onQuit();
    }
  });
}
