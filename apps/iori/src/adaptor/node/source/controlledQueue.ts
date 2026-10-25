import type { MessageQueue, MessageQueueEnqueueOptions, MessageQueueListenOptions } from '@fedify/fedify';

export type QueueTransaction = Readonly<{
  take: () => Promise<{ id: string; message: unknown } | undefined>;
  remove: (id: string) => Promise<void>;
}>;
export type QueueStorage = Readonly<{
  initialize: () => Promise<void>;
  enqueue: (message: unknown, options?: MessageQueueEnqueueOptions) => Promise<void>;
  enqueueMany: (messages: unknown[], options?: MessageQueueEnqueueOptions) => Promise<void>;
  depth: () => Promise<number>;
  transaction: (run: (transaction: QueueTransaction) => Promise<void>) => Promise<void>;
}>;

// Mutable lifecycle is confined to this Node adapter; Fedify requires this interface.
export class ControlledQueue implements MessageQueue {
  #paused = true;
  #dequeueWork = 0;
  #enqueueWork = 0;
  #failed = false;
  #listening = false;
  constructor(private readonly storage: QueueStorage, private readonly pollMs = 100) {}
  snapshot() {
    return {
      paused: this.#paused && this.#dequeueWork === 0,
      dequeueWork: this.#dequeueWork,
      enqueueWork: this.#enqueueWork,
      failed: this.#failed,
    };
  }
  pause() {
    this.#paused = true;
  }
  resume() {
    if (this.#failed) throw new Error('queue_failed');
    this.#paused = false;
  }
  async depth() {
    return this.storage.depth();
  }
  async enqueue(message: unknown, options?: MessageQueueEnqueueOptions) {
    this.#enqueueWork++;
    try {
      await this.storage.enqueue(message, options);
    } finally {
      this.#enqueueWork--;
    }
  }
  async enqueueMany(messages: unknown[], options?: MessageQueueEnqueueOptions) {
    this.#enqueueWork++;
    try {
      await this.storage.enqueueMany(messages, options);
    } finally {
      this.#enqueueWork--;
    }
  }
  async listen(handler: (message: unknown) => void | Promise<void>, options?: MessageQueueListenOptions) {
    if (this.#listening) throw new Error('queue_already_listening');
    this.#listening = true;
    try {
      let initialized = false;
      while (!options?.signal?.aborted) {
        if (this.#paused) {
          await new Promise((resolve) => setTimeout(resolve, this.pollMs));
          continue;
        }
        let found = false;
        this.#dequeueWork++;
        try {
          if (!initialized) {
            await this.storage.initialize();
            initialized = true;
          }
          await this.storage.transaction(async (transaction) => {
            const row = await transaction.take();
            if (!row) return;
            found = true;
            // No abort checkpoint between selection and commit: preserve at-least-once delivery.
            await handler(row.message);
            await transaction.remove(row.id);
          });
        } finally {
          this.#dequeueWork--;
        }
        if (!found) await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      }
    } catch {
      // No database/message details leave the adapter; failure prevents drain evidence.
      this.#failed = true;
    } finally {
      this.#paused = true;
      this.#listening = false;
    }
  }
}
