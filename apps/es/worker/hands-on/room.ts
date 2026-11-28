import {
  liveLimits,
  type LiveMessage,
  parsePostFrame,
  pingText,
  pongText,
  type ServerFrame,
} from '../../src/workspace/live-protocol.ts';

export type RoomSocket = {
  readonly send: (text: string) => void;
  readonly close: (code?: number, reason?: string) => void;
  readonly serializeAttachment: (value: unknown) => void;
  readonly deserializeAttachment: () => unknown;
};

export type RoomStorage = {
  readonly get: <T>(key: string) => Promise<T | undefined>;
  readonly put: (key: string, value: unknown) => Promise<void>;
  readonly delete: (key: string) => Promise<boolean>;
};

export type RoomState = {
  readonly acceptWebSocket: (socket: RoomSocket) => void;
  readonly getWebSockets: () => RoomSocket[];
  readonly setWebSocketAutoResponse?: (pair: unknown) => void;
  readonly storage: RoomStorage;
};

type Attachment = { readonly author: string; readonly sent: readonly number[] };

const messagesKey = 'messages';

const attachmentOf = (socket: RoomSocket): Attachment | null => {
  const value = socket.deserializeAttachment();
  if (typeof value !== 'object' || value === null) return null;
  const { author, sent } = value as { author?: unknown; sent?: unknown };
  if (typeof author !== 'string' || !Array.isArray(sent)) return null;
  return { author, sent: sent.filter((item): item is number => typeof item === 'number') };
};

export const keepRecent = (messages: readonly LiveMessage[], now: number): LiveMessage[] =>
  messages.filter((message) => now - message.at < liveLimits.retentionMs).slice(-liveLimits.historyMessages);

export type Room = {
  readonly join: (socket: RoomSocket, author: string) => Promise<void>;
  readonly receive: (socket: RoomSocket, data: unknown) => Promise<void>;
  readonly clear: () => Promise<void>;
};

export const createRoom = (state: RoomState, now: () => number): Room => {
  let loaded: LiveMessage[] | null = null;

  const messages = async (): Promise<LiveMessage[]> => {
    loaded ??= (await state.storage.get<LiveMessage[]>(messagesKey)) ?? [];
    loaded = keepRecent(loaded, now());
    return loaded;
  };

  const sendTo = (socket: RoomSocket, frame: ServerFrame): void => {
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      return;
    }
  };

  const broadcast = (frame: ServerFrame): void => {
    for (const socket of state.getWebSockets()) sendTo(socket, frame);
  };

  return {
    join: async (socket, author) => {
      state.acceptWebSocket(socket);
      socket.serializeAttachment({ author, sent: [] } satisfies Attachment);
      sendTo(socket, { type: 'hello', author, messages: await messages() });
    },
    receive: async (socket, data) => {
      const attachment = attachmentOf(socket);
      if (attachment === null || typeof data !== 'string') return;
      const frame = parsePostFrame(data);
      if (frame === null) return;
      const at = now();
      const current = await messages();
      const known = current.find((message) => message.id === frame.id);
      if (known !== undefined) {
        if (known.author === attachment.author) sendTo(socket, { type: 'message', message: known });
        return;
      }
      const recent = attachment.sent.filter((time) => at - time < liveLimits.burstWindowMs);
      if (recent.length >= liveLimits.burstMessages) {
        sendTo(socket, { type: 'rejected', id: frame.id, reason: 'rate' });
        return;
      }
      socket.serializeAttachment({ author: attachment.author, sent: [...recent, at] } satisfies Attachment);
      const message: LiveMessage = { id: frame.id, author: attachment.author, name: frame.name, text: frame.text, at };
      loaded = keepRecent([...current, message], at);
      await state.storage.put(messagesKey, loaded);
      broadcast({ type: 'message', message });
    },
    clear: async () => {
      loaded = [];
      await state.storage.delete(messagesKey);
      broadcast({ type: 'cleared' });
    },
  };
};

declare const WebSocketPair: new() => { readonly 0: unknown; readonly 1: RoomSocket };
declare const WebSocketRequestResponsePair: new(request: string, response: string) => unknown;

export const authorParam = 'author';

export class HandsOnRoom {
  readonly #room: Room;

  constructor(state: RoomState) {
    this.#room = createRoom(state, () => Date.now());
    state.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair(pingText, pongText));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'DELETE') {
      await this.#room.clear();
      return new Response(null, { status: 204 });
    }
    const author = new URL(request.url).searchParams.get(authorParam) ?? '';
    const pair = new WebSocketPair();
    await this.#room.join(pair[1], author);
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  async webSocketMessage(socket: RoomSocket, data: unknown): Promise<void> {
    await this.#room.receive(socket, data);
  }

  webSocketClose(socket: RoomSocket): void {
    try {
      socket.close(1000);
    } catch {
      return;
    }
  }

  webSocketError(socket: RoomSocket): void {
    this.webSocketClose(socket);
  }
}
