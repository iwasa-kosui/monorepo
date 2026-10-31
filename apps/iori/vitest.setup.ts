import { afterEach } from 'vitest';

const realSetImmediate = globalThis.setImmediate;

// 同期処理が長く続くテストファイルでも、vitest ワーカーが 60 秒で timeout する RPC 応答を受け取れるようにする
afterEach(() => new Promise<void>((resolve) => realSetImmediate(() => resolve())));
