import { describe, expect, it } from "vitest";
import { ResultAsync } from "./index.js";

describe("ResultAsync", () => {
  describe("try", () => {
    it("returns Ok when promise resolves", async () => {
      const safeFn = ResultAsync.try((e) => `Error: ${e}`)(async () => 42);
      const result = await safeFn();
      expect(result).toEqual({ ok: true, val: 42 });
    });

    it("returns Err when promise rejects", async () => {
      const safeFn = ResultAsync.try((e) => `Caught: ${(e as Error).message}`)(
        async () => {
          throw new Error("failed");
        }
      );
      const result = await safeFn();
      expect(result).toEqual({ ok: false, err: "Caught: failed" });
    });

    it("transforms error using onError callback", async () => {
      class CustomError {
        constructor(public readonly cause: unknown) {}
      }

      const safeFn = ResultAsync.try((e) => new CustomError(e))(async () => {
        throw "raw error";
      });
      const result = await safeFn();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err).toBeInstanceOf(CustomError);
        expect(result.err.cause).toBe("raw error");
      }
    });

    it("preserves function arguments", async () => {
      const add = async (a: number, b: number): Promise<number> => a + b;
      const safeAdd = ResultAsync.try((e) => e)(add);

      const result = await safeAdd(10, 20);
      expect(result).toEqual({ ok: true, val: 30 });
    });

    it("catches thrown errors in async functions with args", async () => {
      const failingFn = async (msg: string): Promise<number> => {
        throw new Error(msg);
      };
      const safeFn = ResultAsync.try((e) => (e as Error).message)(failingFn);

      const result = await safeFn("async error");
      expect(result).toEqual({ ok: false, err: "async error" });
    });

    it("wraps existing async functions", async () => {
      const fetchUser = async (id: number): Promise<{ id: number; name: string }> => {
        if (id < 0) throw new Error("Invalid ID");
        return { id, name: "User" };
      };

      const safeFetchUser = ResultAsync.try((e) => (e as Error).message)(fetchUser);

      const okResult = await safeFetchUser(1);
      expect(okResult).toEqual({ ok: true, val: { id: 1, name: "User" } });

      const errResult = await safeFetchUser(-1);
      expect(errResult).toEqual({ ok: false, err: "Invalid ID" });
    });

    it("accepts onError and fn together", async () => {
      const fetchUser = async (id: number): Promise<{ id: number; name: string }> => {
        if (id < 0) throw new Error("Invalid ID");
        return { id, name: "User" };
      };

      const safeFetchUser = ResultAsync.try((e) => (e as Error).message, fetchUser);

      const okResult = await safeFetchUser(1);
      expect(okResult).toEqual({ ok: true, val: { id: 1, name: "User" } });

      const errResult = await safeFetchUser(-1);
      expect(errResult).toEqual({ ok: false, err: "Invalid ID" });
    });
  });
});
