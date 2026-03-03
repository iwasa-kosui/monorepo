import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { URL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

import type { FileNode } from './fileTree.js';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.zip': 'application/zip',
};

export type ServerOptions = Readonly<{
  port: number;
  baseDir: string;
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
  baseDir,
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

    // Static file serving
    const decodedPath = decodeURIComponent(url.pathname);
    const filePath = path.resolve(path.join(baseDir, decodedPath));
    if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    } catch {
      // File not found, fall through to 404
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
