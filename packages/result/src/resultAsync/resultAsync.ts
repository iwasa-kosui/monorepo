import { flow, pipe } from '../pipe/index.js';
import { Err, Ok, Result } from '../result/result.js';

export type ResultAsync<T, E> = Promise<Result<T, E>>;

export const ok = async <T>(
  val: T | Promise<T>,
): Promise<Ok<T, never>> => ({
  ok: true,
  val: await val,
  err: undefined as never,
});

export const err = async <E>(
  err: E | Promise<E>,
): Promise<Err<never, E>> => ({
  ok: false,
  err: await err,
  val: undefined as never,
});

export const map = <T, T2>(fn: ((input: T) => Promise<T2>) | ((input: T) => T2)) =>
async <E>(
  res: Result<T, E> | Promise<Result<T, E>>,
): Promise<Result<T2, E>> => {
  const awaited = await res;
  return awaited.ok ? ok(await fn(awaited.val)) : awaited;
};

export const mapErr = <E, E2>(fn: ((input: E) => Promise<E2>) | ((input: E) => E2)) =>
async <T>(
  res: Result<T, E> | Promise<Result<T, E>>,
): Promise<Result<T, E2>> => {
  const awaited = await res;
  return awaited.ok ? awaited : err(await fn(awaited.err));
};

export const andThen = <T1, E1, T2, E2>(
  fn:
    | ((input: T1) => Promise<Result<T2, E2>>)
    | ((input: T1) => Result<T2, E2>),
) =>
async (
  res: Result<T1, E1> | Promise<Result<T1, E1>>,
): Promise<Result<T2, E1 | E2>> => {
  const awaited = await res;
  return awaited.ok ? fn(awaited.val) : awaited;
};

export const orElse = <T1, E1, T2, E2>(
  fn:
    | ((input: E1) => Promise<Result<T2, E2>>)
    | ((input: E1) => Result<T2, E2>),
) =>
async (
  res: Result<T1, E1> | Promise<Result<T1, E1>>,
): Promise<Result<T1 | T2, E2>> => {
  const awaited = await res;
  return awaited.ok ? awaited : fn(awaited.err);
};

export const match = <T, E, R1, R2>(opts: {
  ok: ((val: T) => Promise<R1>) | ((val: T) => R1);
  err: ((err: E) => Promise<R2>) | ((err: E) => R2);
}) =>
async (res: Result<T, E> | Promise<Result<T, E>>): Promise<R1 | R2> => {
  const awaited = await res;
  return awaited.ok ? opts.ok(awaited.val) : opts.err(awaited.err);
};

export const bind = <Name extends string, In, Out>(
  name: Name,
  fn: ((input: In) => Promise<Out>) | ((input: In) => Out),
) =>
async <PrevErr>(
  res: Result<In, PrevErr> | Promise<Result<In, PrevErr>>,
): Promise<Result<In & { [K in Name]: Out }, PrevErr>> => {
  const awaited = await res;
  if (!awaited.ok) {
    return awaited;
  }

  const next = await fn(awaited.val);
  return ok(
    { ...awaited.val, [name]: next } as
      & In
      & {
        [K in Name]: Out;
      },
  );
};

export const andBind = <Name extends string, In, Out, Err>(
  name: Name,
  fn: ((input: In) => Promise<Result<Out, Err>>) | ((input: In) => Result<Out, Err>),
) =>
async <PrevErr>(
  res: Result<In, PrevErr> | Promise<Result<In, PrevErr>>,
): Promise<Result<In & { [K in Name]: Out }, Err | PrevErr>> => {
  const awaited = await res;
  if (!awaited.ok) {
    return awaited;
  }

  const next = await fn(awaited.val);
  if (next.ok) {
    return ok(
      { ...awaited.val, [name]: next.val } as
        & In
        & {
          [K in Name]: Out;
        },
    );
  }
  return next;
};

type All = {
  <T extends [unknown, ...unknown[]], E>(
    results: {
      [K in keyof T]: Promise<Result<T[K], E>>;
    },
  ): Promise<Result<T, ReadonlyArray<E>>>;

  <T extends unknown[], E>(
    results: {
      [K in keyof T]: Promise<Result<T[K], E>>;
    },
  ): Promise<Result<T, ReadonlyArray<E>>>;
};

export const all: All = async <T extends [unknown, ...unknown[]], E>(
  results: {
    [K in keyof T]: Promise<Result<T[K], E>>;
  },
): Promise<Result<T, ReadonlyArray<E>>> => {
  const acc: T = [] as unknown as T;
  const errors: E[] = [];
  for (let i = 0; i < results.length; i++) {
    const res = await results[i];
    if (res.ok) {
      acc.push(res.val);
    } else {
      errors.push(res.err);
    }
  }
  if (errors.length > 0) {
    return err(errors);
  }
  return ok(acc as T);
};

export const andThrough =
  <T1, E1, T2, E2>(sideEffect: (input: T1) => Promise<Result<T2, E2>> | Result<T2, E2>) =>
  async (
    res: Result<T1, E1> | Promise<Result<T1, E1>>,
  ): Promise<Result<T1, E1 | E2>> => {
    const awaited = await res;
    if (!awaited.ok) {
      return awaited;
    }
    const next = await sideEffect(awaited.val);
    if (next.ok) {
      return awaited;
    }
    return next;
  };

export const isOk = async <T, E>(
  res: Result<T, E> | Promise<Result<T, E>>,
): Promise<boolean> => {
  const awaited = await res;
  return awaited.ok;
};

export const isErr = async <T, E>(
  res: Result<T, E> | Promise<Result<T, E>>,
): Promise<boolean> => {
  const awaited = await res;
  return !awaited.ok;
};

export function tryFn<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
): <E>(
  onError: (error: unknown) => E,
) => (...args: Args) => Promise<Result<T, E>>;

export function tryFn<T, Args extends unknown[], E>(
  fn: (...args: Args) => Promise<T>,
  onError: (error: unknown) => E,
): (...args: Args) => Promise<Result<T, E>>;

export function tryFn<T, Args extends unknown[], E>(
  fn: (...args: Args) => Promise<T>,
  onError?: (error: unknown) => E,
) {
  const wrap = <E2>(handler: (error: unknown) => E2) => async (...args: Args): Promise<Result<T, E2>> => {
    try {
      const val = await fn(...args);
      return ok(val);
    } catch (e) {
      return err(handler(e));
    }
  };

  return onError !== undefined ? wrap(onError) : wrap;
}

export { tryFn as try };

export { flow, pipe };
