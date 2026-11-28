import { reconnectDelayMs } from './live';
import {
  type LiveMessage,
  parseServerFrame,
  pingText,
  pongText,
  type PostFrame,
  type RejectReason,
} from './live-protocol';

export type LiveStatus = 'connecting' | 'online' | 'offline';

export type LiveHandlers = {
  readonly onStatus: (status: LiveStatus) => void;
  readonly onHello: (author: string, messages: readonly LiveMessage[]) => void;
  readonly onMessage: (message: LiveMessage) => void;
  readonly onRejected: (id: string, reason: RejectReason) => void;
  readonly onCleared: () => void;
};

export type LiveConnection = {
  readonly post: (frame: PostFrame) => void;
  readonly close: () => void;
};

const pingEveryMs = 25_000;
const helloTimeoutMs = 8000;

export const newLiveId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const connectLive = (url: string, handlers: LiveHandlers): LiveConnection => {
  const pending = new Map<string, PostFrame>();
  let socket: WebSocket | null = null;
  let attempt = 0;
  let closed = false;
  let retryId: number | undefined;
  let pingId: number | undefined;

  const flush = (): void => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    for (const frame of pending.values()) socket.send(JSON.stringify(frame));
  };

  const open = (): void => {
    if (closed) return;
    handlers.onStatus(attempt === 0 ? 'connecting' : 'offline');
    let current: WebSocket;
    try {
      current = new WebSocket(url);
    } catch {
      handlers.onStatus('offline');
      return;
    }
    socket = current;
    const helloId = window.setTimeout(() => current.close(), helloTimeoutMs);
    current.addEventListener('open', () => {
      window.clearInterval(pingId);
      pingId = window.setInterval(() => {
        if (current.readyState === WebSocket.OPEN) current.send(pingText);
      }, pingEveryMs);
    });
    current.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || event.data === pongText) return;
      const frame = parseServerFrame(event.data);
      if (frame === null) return;
      if (frame.type === 'hello') {
        window.clearTimeout(helloId);
        attempt = 0;
        handlers.onStatus('online');
        handlers.onHello(frame.author, frame.messages);
        flush();
        return;
      }
      if (frame.type === 'message') {
        pending.delete(frame.message.id);
        handlers.onMessage(frame.message);
        return;
      }
      if (frame.type === 'rejected') {
        pending.delete(frame.id);
        handlers.onRejected(frame.id, frame.reason);
        return;
      }
      handlers.onCleared();
    });
    current.addEventListener('close', () => {
      window.clearTimeout(helloId);
      window.clearInterval(pingId);
      if (socket !== current) return;
      socket = null;
      if (closed) return;
      handlers.onStatus('offline');
      retryId = window.setTimeout(open, reconnectDelayMs(attempt));
      attempt += 1;
    });
  };

  open();

  return {
    post: (frame) => {
      pending.set(frame.id, frame);
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    },
    close: () => {
      closed = true;
      window.clearTimeout(retryId);
      window.clearInterval(pingId);
      socket?.close();
    },
  };
};
