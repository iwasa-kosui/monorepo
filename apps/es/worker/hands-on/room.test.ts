import { describe, expect, it } from 'vitest';

import { liveLimits, type LiveMessage, type ServerFrame } from '../../src/workspace/live-protocol.ts';
import { createRoom, keepRecent, type RoomSocket, type RoomState } from './room.ts';

type FakeSocket = RoomSocket & { readonly frames: () => ServerFrame[]; readonly breakSend: () => void };

const fakeSocket = (): FakeSocket => {
  const sent: string[] = [];
  let attachment: unknown = null;
  let broken = false;
  return {
    send: (text) => {
      if (broken) throw new Error('閉じた接続です');
      sent.push(text);
    },
    close: () => undefined,
    serializeAttachment: (value) => {
      attachment = structuredClone(value);
    },
    deserializeAttachment: () => attachment,
    frames: () => sent.map((text) => JSON.parse(text) as ServerFrame),
    breakSend: () => {
      broken = true;
    },
  };
};

const fakeState = (stored = new Map<string, unknown>()) => {
  const sockets: RoomSocket[] = [];
  const state: RoomState = {
    acceptWebSocket: (socket) => {
      sockets.push(socket);
    },
    getWebSockets: () => sockets,
    storage: {
      get: <T>(key: string) => Promise.resolve(stored.get(key) as T | undefined),
      put: (key, value) => {
        stored.set(key, structuredClone(value));
        return Promise.resolve();
      },
      delete: (key) => Promise.resolve(stored.delete(key)),
    },
  };
  return { state, stored };
};

const idOf = (index: number): string => `message-${String(index).padStart(4, '0')}`;
const postOf = (index: number, text = `本文 ${index}`, name = '眠い柴犬'): string =>
  JSON.stringify({ type: 'post', id: idOf(index), name, text });

const setup = (startAt = 1_000_000) => {
  const clock = { now: startAt };
  const { state, stored } = fakeState();
  const room = createRoom(state, () => clock.now);
  return { clock, state, stored, room };
};

describe('ハンズオンの部屋', () => {
  it('参加した接続に、自分の author と、これまでのメッセージを送る', async () => {
    const { room } = setup();
    const first = fakeSocket();
    await room.join(first, 'author-a');
    await room.receive(first, postOf(1));
    const second = fakeSocket();
    await room.join(second, 'author-b');
    expect(second.frames()).toEqual([{
      type: 'hello',
      author: 'author-b',
      messages: [{ id: idOf(1), author: 'author-a', name: '眠い柴犬', text: '本文 1', at: 1_000_000 }],
    }]);
  });

  it('届いた投稿を、送った本人を含む全員に配り、保存する', async () => {
    const { room, stored } = setup();
    const first = fakeSocket();
    const second = fakeSocket();
    await room.join(first, 'author-a');
    await room.join(second, 'author-b');
    await room.receive(second, postOf(1, ' こんにちは ', ' てすと太郎 '));
    const message = { id: idOf(1), author: 'author-b', name: 'てすと太郎', text: 'こんにちは', at: 1_000_000 };
    expect(first.frames().at(-1)).toEqual({ type: 'message', message });
    expect(second.frames().at(-1)).toEqual({ type: 'message', message });
    expect(stored.get('messages')).toEqual([message]);
  });

  it('メモリから降ろされた後も、保存したメッセージを新しい接続に送る', async () => {
    const { room, state } = setup();
    const first = fakeSocket();
    await room.join(first, 'author-a');
    await room.receive(first, postOf(1));
    const woken = createRoom(state, () => 1_000_500);
    const second = fakeSocket();
    await woken.join(second, 'author-b');
    expect(second.frames()[0]).toMatchObject({ type: 'hello', messages: [{ id: idOf(1) }] });
  });

  it('読めない投稿は、配らず、保存もしない', async () => {
    const { room, stored } = setup();
    const socket = fakeSocket();
    await room.join(socket, 'author-a');
    await room.receive(socket, 'not json');
    await room.receive(socket, new ArrayBuffer(4));
    await room.receive(socket, JSON.stringify({ type: 'post', id: idOf(1), name: '柴犬', text: '   ' }));
    expect(socket.frames()).toHaveLength(1);
    expect(stored.has('messages')).toBe(false);
  });

  it('同じ id の投稿が再び届いたときは、増やさずに、送った本人にだけ保存済みのメッセージを返す', async () => {
    const { room, stored } = setup();
    const first = fakeSocket();
    const second = fakeSocket();
    await room.join(first, 'author-a');
    await room.join(second, 'author-b');
    await room.receive(first, postOf(1));
    await room.receive(first, postOf(1));
    await room.receive(second, postOf(1, '別の人が同じ id で送る'));
    expect(stored.get('messages')).toHaveLength(1);
    expect(first.frames().filter((frame) => frame.type === 'message')).toHaveLength(2);
    expect(second.frames().filter((frame) => frame.type === 'message')).toHaveLength(1);
  });

  it('短い時間に続けて送ると、上限を超えた投稿を断り、時間が過ぎるとまた受け付ける', async () => {
    const { room, stored, clock } = setup();
    const socket = fakeSocket();
    await room.join(socket, 'author-a');
    for (let index = 0; index < liveLimits.burstMessages; index += 1) {
      await room.receive(socket, postOf(index));
    }
    await room.receive(socket, postOf(100));
    expect(socket.frames().at(-1)).toEqual({ type: 'rejected', id: idOf(100), reason: 'rate' });
    expect(stored.get('messages')).toHaveLength(liveLimits.burstMessages);
    clock.now += liveLimits.burstWindowMs;
    await room.receive(socket, postOf(101));
    expect(socket.frames().at(-1)).toMatchObject({ type: 'message', message: { id: idOf(101) } });
  });

  it('送信に失敗する接続があっても、ほかの接続には配る', async () => {
    const { room } = setup();
    const broken = fakeSocket();
    const healthy = fakeSocket();
    await room.join(broken, 'author-a');
    await room.join(healthy, 'author-b');
    broken.breakSend();
    await room.receive(healthy, postOf(1));
    expect(healthy.frames().at(-1)).toMatchObject({ type: 'message' });
  });

  it('消去すると、保存したメッセージを消し、全員に知らせる', async () => {
    const { room, stored } = setup();
    const socket = fakeSocket();
    await room.join(socket, 'author-a');
    await room.receive(socket, postOf(1));
    await room.clear();
    expect(stored.has('messages')).toBe(false);
    expect(socket.frames().at(-1)).toEqual({ type: 'cleared' });
    const next = fakeSocket();
    await room.join(next, 'author-b');
    expect(next.frames()[0]).toMatchObject({ type: 'hello', messages: [] });
  });
});

describe('残すメッセージ', () => {
  const messageAt = (index: number, at: number): LiveMessage => ({
    id: idOf(index),
    author: 'author-a',
    name: '柴犬',
    text: 'x',
    at,
  });

  it('保存の期限を過ぎたメッセージを除く', () => {
    const now = liveLimits.retentionMs + 10;
    expect(keepRecent([messageAt(1, 5), messageAt(2, 11)], now).map((message) => message.id)).toEqual([idOf(2)]);
  });

  it('上限の件数を超えたら、古いものから除く', () => {
    const messages = Array.from({ length: liveLimits.historyMessages + 3 }, (_, index) => messageAt(index, 100));
    const kept = keepRecent(messages, 200);
    expect(kept).toHaveLength(liveLimits.historyMessages);
    expect(kept[0]?.id).toBe(idOf(3));
  });
});
