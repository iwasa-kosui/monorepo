import { useInput } from 'ink';

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
  useInput((input, key) => {
    if (!opts.isActive) return;

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
    } else if (input === 'r') {
      opts.onReload();
    } else if (input === 'q') {
      opts.onQuit();
    }
  });
}
