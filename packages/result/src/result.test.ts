import { describe, expect, it } from "vitest";
import { Result } from "./index.js";
import { flow } from "@iwasa-kosui/pipe/src/flow.js";
import { pipe } from "@iwasa-kosui/pipe/src/pipe.js";

describe("Result", () => {
  describe("ok", () => {
    it("creates an Ok result", () => {
      const result = Result.ok(42);
      expect(result).toEqual({ ok: true, val: 42 });
    });
  });

  describe("err", () => {
    it("creates an Err result", () => {
      const result = Result.err("error");
      expect(result).toEqual({ ok: false, err: "error" });
    });
  })

  describe("isOk", () => {
    it("returns true for Ok results", () => {
      const result = Result.ok(42);
      expect(Result.isOk(result)).toBe(true);
    });

    it("returns false for Err results", () => {
      const result = Result.err("error");
      expect(Result.isOk(result)).toBe(false);
    });
  });

  describe("isErr", () => {
    it("returns true for Err results", () => {
      const result = Result.err("error");
      expect(Result.isErr(result)).toBe(true);
    });

    it("returns false for Ok results", () => {
      const result = Result.ok(42);
      expect(Result.isErr(result)).toBe(false);
    });
  });

  describe("map", () => {
    it("maps Ok values", () => {
      const res = flow(
        Result.ok(21),
        Result.map((x) => x * 2)
      )
      expect(res).toEqual(Result.ok(42));
    });

    it("does not map Err values", () => {
      const res = flow(
        Result.err('error'),
        Result.map((x: number) => x * 2),
      )
      expect(res).toEqual(Result.err("error"));
    });
  });

  describe("mapErr", () => {
    it("maps Err values", () => {
      const res = flow(
        Result.err('error'),
        Result.mapErr((e) => e.toUpperCase())
      )
      expect(res).toEqual(Result.err("ERROR"));
    });

    it("does not map Ok values", () => {
      const res = flow(
        Result.ok(42),
        Result.mapErr((e: string) => e.toUpperCase()),
      )
      expect(res).toEqual(Result.ok(42));
    });
  });

  describe("map and mapErr chaining", () => {
    it("chains map and mapErr correctly", () => {
      const f = pipe(
        Result.map((x: number) => x * 2)<string>,
        Result.mapErr((e: string) => e.toUpperCase())
      )
      expect(f(Result.ok(21))).toEqual(Result.ok(42));

      const res2 = flow(
        Result.err('error'),
        Result.map((x: number) => x * 2),
        Result.mapErr((e) => e.toUpperCase())
      )
      expect(res2).toEqual(Result.err("ERROR"));
    });
  });

  describe("andThen", () => {
    it("chains Ok results", () => {
      const res = flow(
        Result.ok(21),
        Result.andThen((x) => Result.ok(x * 2))
      )
      expect(res).toEqual(Result.ok(42));
    });

    it("short-circuits on Err results", () => {
      const f = pipe(
        Result.andThen((x: number): Result<number, string> => x === 21 ? Result.err("error") : Result.ok(x * 2)),
        Result.andThen((x) => Result.ok(x * 2))
      )
      expect(f(Result.ok(21))).toEqual(Result.err("error"));
      expect(f(Result.ok(10))).toEqual(Result.ok(40));
    });
  });

  describe("orElse", () => {
    it("chains Err results", () => {
      const res = flow(
        Result.err('error'),
        Result.orElse((e) => Result.err(e.toUpperCase()))
      )
      expect(res).toEqual(Result.err("ERROR"));
    });

    it("short-circuits on Ok results", () => {
      const f = pipe(
        Result.orElse((e: string): Result<number, string> => e === "error" ? Result.ok(42) : Result.err(e.toUpperCase())),
        Result.orElse((e) => Result.err(e.toUpperCase()))
      )
      expect(f(Result.err("error"))).toEqual(Result.ok(42));
      expect(f(Result.err("other"))).toEqual(Result.err("OTHER"));
    });
  });

  describe("combine", () => {
    it("combines multiple Ok results", () => {
      const res = Result.combine({
        a: Result.ok(1),
        b: Result.ok(2),
        c: Result.ok(3),
      });
      expect(res).toEqual(Result.ok({ a: 1, b: 2, c: 3 }));
    });

    it("returns the first Err result", () => {
      const res = Result.combine({
        a: Result.ok(1),
        b: Result.err("error in b"),
        c: Result.err("error in c"),
      });
      expect(res).toEqual(Result.err([
        "error in b",
        "error in c"
      ]));
    });
  });

  describe("all", () => {
    it("aggregates Ok results", () => {
      const res = Result.all([
        Result.ok(1),
        Result.ok(2),
        Result.ok(3),
      ]);
      expect(res).toEqual(Result.ok([1, 2, 3]));
    });

    it("aggregates Err results", () => {
      const res = Result.all([
        Result.ok(1),
        Result.err("error in 2"),
        Result.err("error in 3"),
      ]);
      expect(res).toEqual(Result.err([
        "error in 2",
        "error in 3"
      ]));
    });
  });

  describe("bind", () => {
    it("binds new values to Ok results", () => {
      const res = flow(
        Result.ok({ a: 1 }),
        Result.bind("b", (obj) => Result.ok(obj.a + 1)),
        Result.bind("c", (obj) => Result.ok(obj.b + 1))
      )
      expect(res).toEqual(Result.ok({ a: 1, b: 2, c: 3 }));
    });

    it("short-circuits on Err results", () => {
      const res = flow(
        Result.ok({ a: 1 }),
        Result.bind("b", (): Result<number, string> => Result.err("error in b")),
        Result.bind("c", (obj) => Result.ok(obj.b + 1))
      )
      expect(res).toEqual(Result.err("error in b"));
    });

    it("propagates Err results", () => {
      const res = flow(
        Result.err("initial error"),
        Result.bind("b", () => Result.ok(2)),
        Result.bind("c", () => Result.ok(3))
      )
      expect(res).toEqual(Result.err("initial error"));
    });

    it("types the bound object correctly", () => {
      const res = flow(
        Result.ok({ a: 1 }),
        Result.bind("b", (obj) => {
          // TypeScript should infer obj as { a: number }
          const sum: number = obj.a + 1;
          return Result.ok(sum);
        }),
        Result.bind("c", (obj) => {
          // TypeScript should infer obj as { a: number; b: number }
          const sum: number = obj.a + obj.b + 1;
          return Result.ok(sum);
        }),
      )
      expect(res).toEqual(Result.ok({ a: 1, b: 2, c: 4 }));
    });
  });

  describe("async functions", () => {
    it("andThenAsync works correctly", async () => {
      const res = await flow(
        Result.ok(21),
        Result.andThenAsync(async (x) => Result.ok(x * 2))
      )
      expect(res).toEqual(Result.ok(42));
    });

    it("orElseAsync works correctly", async () => {
      const res = await flow(
        Result.err('error'),
        Result.orElseAsync(async (e) => Result.err(e.toUpperCase()))
      )
      expect(res).toEqual(Result.err("ERROR"));
    });
  });
})
