import { flow, pipe } from "@iwasa-kosui/pipe/src/index.js";

type Ok<T, E> = Readonly<{
  ok: true;
  val: T;
}>;

type Err<T, E> = Readonly<{
  ok: false;
  err: E;
}>;

export type Result<T, E> = Ok<T, never> | Err<never, E>;

export const ok = <T>(val: T): Ok<T, never> => ({
  ok: true,
  val,
});

export const err = <E>(err: E): Err<never, E> => ({
  ok: false,
  err,
});

export const isOk = <T, E>(res: Result<T, E>): res is Ok<T, E> => res.ok;

export const isErr = <T, E>(res: Result<T, E>): res is Err<T, E> => !res.ok;

export const map = <T, T2>(
  fn: (input: T) => T2,
) => <E>(res: Result<T, E>): Result<T2, E> =>
    res.ok ? ok(fn(res.val)) : res;

export const mapErr = <E, E2>(
  fn: (input: E) => E2,
) => <T>(res: Result<T, E>): Result<T, E2> =>
    res.ok ? res : err(fn(res.err));

export const unwrapOr = <T, E, T2>(defaultVal: T2) => (
  res: Result<T, E>,
): T | T2 => (res.ok ? res.val : defaultVal);

export const andThen = <T, E, T2>(
  fn: (input: T) => Result<T2, E>,
) => (res: Result<T, E>): Result<T2, E> =>
    res.ok ? fn(res.val) : res;

export const orElse = <T, E, E2>(
  fn: (input: E) => Result<T, E2>,
) => (res: Result<T, E>): Result<T, E2> =>
    res.ok ? res : fn(res.err);

export const unsafeUnwrap = <T, E>(res: Result<T, E>): T => {
  if (res.ok) {
    return res.val;
  }
  throw new Error("Tried to unwrap an Err value");
}

export const unsafeUnwrapErr = <T, E>(res: Result<T, E>): E => {
  if (!res.ok) {
    return res.err;
  }
  throw new Error("Tried to unwrapErr an Ok value");
}

export const match = <T, E, R1, R2>(opts: {
  ok: (val: T) => R1;
  err: (err: E) => R2;
}) => (res: Result<T, E>): R1 | R2 =>
    res.ok ? opts.ok(res.val) : opts.err(res.err);

export const bind = <Name extends string, T, E, T2>(
  name: Name,
  fn: (input: T) => Result<T2, E>,
) => (res: Result<T, E>): Result<T & { [K in Name]: T2 }, E> =>
    flow(
      res,
      andThen((t: T) =>
        flow(
          t,
          fn,
          map((t2) => ({ ...t, [name]: t2 } as T & { [K in Name]: T2 })),
        ),
      ),
    )

export const combine = <T extends Record<string | number | symbol, unknown>, E>(
  results: { [K in keyof T]: Result<T[K], E> },
): Result<T, ReadonlyArray<E>> => {
  const acc: Partial<T> = {};
  const errors: E[] = [];
  for (const key in results) {
    const res = results[key];
    if (res.ok) {
      acc[key] = res.val;
    } else {
      errors.push(res.err);
    }
  }
  if (errors.length > 0) {
    return err(errors);
  }
  return ok(acc as T);
}

export const all = <T extends [unknown, ...unknown[]], E>(
  results: { [K in keyof T]: Result<T[K], E> },
): Result<T, ReadonlyArray<E>> => {
  const acc: T = [] as unknown as T;
  const errors: E[] = [];
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
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
}

export const okAsync = async <T>(val: T | Promise<T>): Promise<Ok<T, never>> => ({
  ok: true,
  val: await val,
});

export const errAsync = async <E>(err: E | Promise<E>): Promise<Err<never, E>> => ({
  ok: false,
  err: await err,
});

export const mapAsync = <T, T2>(
  fn: (input: T) => Promise<T2>,
) => async <E>(res: Result<T, E> | Promise<Result<T, E>>): Promise<Result<T2, E>> => {
  const awaited = await res;
  return awaited.ok ? ok(await fn(awaited.val)) : awaited;
}

export const mapErrAsync = <E, E2>(
  fn: (input: E) => Promise<E2>,
) => async <T>(res: Result<T, E> | Promise<Result<T, E>>): Promise<Result<T, E2>> => {
  const awaited = await res;
  return awaited.ok ? awaited : errAsync(await fn(awaited.err));
}

export const andThenAsync = <T, E, T2>(
  fn: (input: T) => Promise<Result<T2, E>>,
) => async (res: Result<T, E> | Promise<Result<T, E>>): Promise<Result<T2, E>> => {
  const awaited = await res;
  return awaited.ok ? fn(awaited.val) : awaited;
}

export const orElseAsync = <T, E, E2>(
  fn: (input: E) => Promise<Result<T, E2>>,
) => async (res: Result<T, E> | Promise<Result<T, E>>): Promise<Result<T, E2>> => {
  const awaited = await res;
  return awaited.ok ? awaited : fn(awaited.err);
}

export { flow, pipe }
