import * as fs from 'node:fs';
import * as path from 'node:path';

export type WatcherOptions = Readonly<{
  filePath: string;
  onChange: () => void;
  debounceMs?: number;
}>;

export type Watcher = Readonly<{
  start: () => void;
  stop: () => void;
}>;

export const createWatcher = ({
  filePath,
  onChange,
  debounceMs = 100,
}: WatcherOptions): Watcher => {
  let watcher: fs.FSWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  const handleChange = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      onChange();
      debounceTimer = null;
    }, debounceMs);
  };

  const start = (): void => {
    if (watcher) return;

    watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        handleChange();
      }
    });

    watcher.on('error', (error) => {
      console.error(`Watcher error: ${error.message}`);
    });
  };

  const stop = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  };

  return { start, stop } as const;
};

export type DirectoryWatcherOptions = Readonly<{
  dirPath: string;
  onChange: (filePath: string) => void;
  onTreeChange?: () => void;
  debounceMs?: number;
}>;

export const createDirectoryWatcher = ({
  dirPath,
  onChange,
  onTreeChange,
  debounceMs = 100,
}: DirectoryWatcherOptions): Watcher => {
  const watchers = new Map<string, fs.FSWatcher>();
  let changeDebounceTimer: NodeJS.Timeout | null = null;
  let treeDebounceTimer: NodeJS.Timeout | null = null;
  let lastChangedFile: string | null = null;

  const handleChange = (filePath: string): void => {
    lastChangedFile = filePath;
    if (changeDebounceTimer) {
      clearTimeout(changeDebounceTimer);
    }
    changeDebounceTimer = setTimeout(() => {
      if (lastChangedFile) {
        onChange(lastChangedFile);
      }
      changeDebounceTimer = null;
      lastChangedFile = null;
    }, debounceMs);
  };

  const handleTreeChange = (): void => {
    if (!onTreeChange) return;
    if (treeDebounceTimer) {
      clearTimeout(treeDebounceTimer);
    }
    treeDebounceTimer = setTimeout(() => {
      onTreeChange();
      treeDebounceTimer = null;
    }, debounceMs);
  };

  const watchDirectory = (dir: string): void => {
    if (watchers.has(dir)) return;

    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const isMarkdown = /\.md$/i.test(filename);

        if (eventType === 'change' && isMarkdown) {
          const fullPath = path.join(dir, filename);
          handleChange(fullPath);
        }

        if (eventType === 'rename') {
          handleTreeChange();
        }
      });

      watcher.on('error', (error) => {
        console.error(`Directory watcher error for ${dir}: ${error.message}`);
      });

      watchers.set(dir, watcher);
    } catch (error) {
      console.error(`Failed to watch directory ${dir}:`, error);
    }
  };

  const start = (): void => {
    watchDirectory(dirPath);
  };

  const stop = (): void => {
    if (changeDebounceTimer) {
      clearTimeout(changeDebounceTimer);
      changeDebounceTimer = null;
    }
    if (treeDebounceTimer) {
      clearTimeout(treeDebounceTimer);
      treeDebounceTimer = null;
    }
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();
  };

  return { start, stop } as const;
};
