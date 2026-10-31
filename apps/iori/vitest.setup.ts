import { afterEach } from 'vitest';

// テストが fake timers に差し替えても、本物の setImmediate で待つ
const realSetImmediate = globalThis.setImmediate;

// 同期処理が長く続くテストファイルでも、vitest ワーカーが 60 秒で timeout する RPC 応答を受け取れるようにする
afterEach(() => new Promise<void>((resolve) => realSetImmediate(() => resolve())));
