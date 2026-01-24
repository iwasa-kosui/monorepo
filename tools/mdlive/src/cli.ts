import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { openBrowser } from './browser.js';
import { parseArgs, showUsage } from './config.js';
import { buildFileTree, type FileNode } from './fileTree.js';
import { createMarkdownConverter } from './markdown.js';
import { createServer } from './server.js';
import { renderDirectoryHtml, renderHtml } from './template.js';
import { createDirectoryWatcher, createWatcher } from './watcher.js';

const runFileMode = async (
  filePath: string,
  port: number,
  open: boolean,
): Promise<void> => {
  const converter = createMarkdownConverter();
  const fileName = path.basename(filePath);

  const getHtml = async (): Promise<string> => {
    const markdown = await fs.readFile(filePath, 'utf-8');
    const result = await converter.convert(markdown);

    if (!result.ok) {
      return renderHtml({
        title: fileName,
        content: `<p style="color: red;">Error: ${result.err.message}</p>`,
        wsPort: port,
      });
    }

    return renderHtml({
      title: fileName,
      content: result.val,
      wsPort: port,
    });
  };

  const server = createServer({
    port,
    getHtml,
  });

  const watcher = createWatcher({
    filePath,
    onChange: () => {
      console.log(`File changed: ${fileName}`);
      server.broadcast('reload');
    },
  });

  const cleanup = (): void => {
    console.log('\nShutting down...');
    watcher.stop();
    server.stop().then(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await server.start();
  watcher.start();

  console.log('mdlive v0.1.0');
  console.log(`Watching: ${filePath}`);
  console.log(`HTTP Server: http://localhost:${port}`);
  console.log('Press Ctrl+C to stop');

  if (open) {
    openBrowser(`http://localhost:${port}`);
  }
};

const runDirectoryMode = async (
  dirPath: string,
  port: number,
  open: boolean,
): Promise<void> => {
  const converter = createMarkdownConverter();
  const dirName = path.basename(dirPath);

  let fileTree: FileNode = buildFileTree(dirPath);

  const refreshFileTree = (): void => {
    fileTree = buildFileTree(dirPath);
  };

  const getHtml = async (relativePath?: string): Promise<string> => {
    if (!relativePath) {
      return renderDirectoryHtml({
        title: dirName,
        content: '',
        wsPort: port,
        fileTree,
        currentFile: undefined,
      });
    }

    const filePath = path.join(dirPath, relativePath);
    try {
      const markdown = await fs.readFile(filePath, 'utf-8');
      const result = await converter.convert(markdown);

      if (!result.ok) {
        return renderDirectoryHtml({
          title: relativePath,
          content: `<p style="color: red;">Error: ${result.err.message}</p>`,
          wsPort: port,
          fileTree,
          currentFile: relativePath,
        });
      }

      return renderDirectoryHtml({
        title: relativePath,
        content: result.val,
        wsPort: port,
        fileTree,
        currentFile: relativePath,
      });
    } catch {
      return renderDirectoryHtml({
        title: dirName,
        content: `<p style="color: red;">Error: File not found: ${relativePath}</p>`,
        wsPort: port,
        fileTree,
        currentFile: undefined,
      });
    }
  };

  const getFileContent = async (relativePath: string): Promise<string | null> => {
    const filePath = path.join(dirPath, relativePath);
    try {
      const markdown = await fs.readFile(filePath, 'utf-8');
      const result = await converter.convert(markdown);
      return result.ok ? result.val : null;
    } catch {
      return null;
    }
  };

  const server = createServer({
    port,
    getHtml,
    getFileTree: () => fileTree,
    getFileContent,
  });

  const watcher = createDirectoryWatcher({
    dirPath,
    onChange: (changedFilePath) => {
      const relativePath = path.relative(dirPath, changedFilePath);
      console.log(`File changed: ${relativePath}`);
      server.broadcast('reload');
    },
    onTreeChange: () => {
      console.log('Directory structure changed');
      refreshFileTree();
      server.broadcast('tree-update');
    },
  });

  const cleanup = (): void => {
    console.log('\nShutting down...');
    watcher.stop();
    server.stop().then(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await server.start();
  watcher.start();

  console.log('mdlive v0.1.0');
  console.log(`Watching directory: ${dirPath}`);
  console.log(`HTTP Server: http://localhost:${port}`);
  console.log('Press Ctrl+C to stop');

  if (open) {
    openBrowser(`http://localhost:${port}`);
  }
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(showUsage());
    process.exit(0);
  }

  const configResult = parseArgs(args);

  if (!configResult.ok) {
    console.error('Error:', configResult.err.message);
    console.log('\n' + showUsage());
    process.exit(1);
  }

  const config = configResult.val;
  const targetPath = path.resolve(config.file);

  try {
    await fs.access(targetPath);
  } catch {
    console.error(`Error: Path not found: ${targetPath}`);
    process.exit(1);
  }

  const stat = fsSync.statSync(targetPath);

  try {
    if (stat.isDirectory()) {
      await runDirectoryMode(targetPath, config.port, config.open);
    } else {
      await runFileMode(targetPath, config.port, config.open);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to start server: ${message}`);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
