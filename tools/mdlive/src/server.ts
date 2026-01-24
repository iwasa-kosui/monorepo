import * as http from 'node:http';
import { URL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

import type { FileNode } from './fileTree.js';

export type ServerOptions = Readonly<{
  port: number;
  getHtml: (filePath?: string) => Promise<string>;
  getFileTree?: () => FileNode;
  getFileContent?: (relativePath: string) => Promise<string | null>;
}>;

export type Server = Readonly<{
  start: () => Promise<void>;
  stop: () => Promise<void>;
  broadcast: (message: string) => void;
}>;

export const createServer = ({
  port,
  getHtml,
  getFileTree,
  getFileContent,
}: ServerOptions): Server => {
  const clients = new Set<WebSocket>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    // API: Get file tree
    if (url.pathname === '/api/tree' && getFileTree) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getFileTree()));
      return;
    }

    // API: Get file content as HTML
    if (url.pathname === '/api/content' && getFileContent) {
      const filePath = url.searchParams.get('file');
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'file parameter required' }));
        return;
      }

      const content = await getFileContent(filePath);
      if (content === null) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    }

    // Main page
    if (url.pathname === '/' || url.pathname === '/index.html') {
      try {
        const filePath = url.searchParams.get('file') ?? undefined;
        const html = await getHtml(filePath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => {
      clients.delete(ws);
    });
    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  const start = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      httpServer.on('error', reject);
      httpServer.listen(port, () => {
        resolve();
      });
    });
  };

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      for (const client of clients) {
        client.close();
      }
      clients.clear();

      // Force close all active connections
      httpServer.closeAllConnections();

      wss.close(() => {
        httpServer.close(() => {
          resolve();
        });
      });
    });
  };

  const broadcast = (message: string): void => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  return { start, stop, broadcast } as const;
};
