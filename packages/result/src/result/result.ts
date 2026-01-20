import { flow, pipe } from '../pipe/index.js';

export type Ok<T, _E = never> = Readonly<{
  ok: true;
  val: T;
  err: never;
}>;

export type Err<_T = never, E = unknown> = Readonly<{
  ok: false;
  err: E;
  val: never;
}>;

export type Result<T, E> = Ok<T, E> | Err<T, E>;

export const ok = <T>(val: T): Ok<T, never> => ({
  ok: true,
  val,
  err: undefined as never,
});

export const err = <E>(err: E): Err<never, E> => ({
  ok: false,
  err,
  val: undefined as never,
});

export const isOk = <T, E>(res: Result<T, E>): res is Ok<T, E> => res.ok;

export const isErr = <T, E>(res: Result<T, E>): res is Err<T, E> => !res.ok;

export const map = <T, T2>(fn: (input: T) => T2) => <E>(res: Result<T, E>): Result<T2, E> =>
  res.ok ? ok(fn(res.val)) : res;

export const mapErr = <PrevErr, Err>(fn: (err: PrevErr) => Err) => <In>(res: Result<In, PrevErr>): Result<In, Err> =>
  res.ok ? res : err(fn(res.err));

export const unwrapOr = <T, E, T2>(defaultVal: T2) => (res: Result<T, E>): T | T2 => res.ok ? res.val : defaultVal;

export const andThen =
  <T1, E1, T2, E2>(fn: (input: T1) => Result<T2, E2>) => (res: Result<T1, E1>): Result<T2, E1 | E2> =>
    res.ok ? fn(res.val) : res;

export const orElse =
  <T1, E1, T2, E2>(fn: (input: E1) => Result<T2, E2>) => (res: Result<T1, E1>): Result<T1 | T2, E2> =>
    res.ok ? res : fn(res.err);

export const unsafeUnwrap = <T, E>(res: Result<T, E>): T => {
  if (res.ok) {
    return res.val;
  }
  throw new Error('Tried to unwrap an Err value');
};

export const unsafeUnwrapErr = <T, E>(res: Result<T, E>): E => {
  if (!res.ok) {
    return res.err;
  }
  throw new Error('Tried to unwrapErr an Ok value');
};

export const match =
  <T, E, R1, R2>(opts: { ok: (val: T) => R1; err: (err: E) => R2 }) => (res: Result<T, E>): R1 | R2 =>
    res.ok ? opts.ok(res.val) : opts.err(res.err);

type Bind = <
  Name extends string,
  In,
  Out,
  Err,
  PrevErr,
>(
  name: Name,
  fn: (input: In) => Result<Out, Err>,
) => (
  res: Result<In, PrevErr>,
) => Result<In & { [K in Name]: Out }, Err | PrevErr>;

export const bind: Bind = <
  Name extends string,
  In,
  Out,
  Err,
  PrevErr,
>(
  name: Name,
  fn: (input: In) => Result<Out, Err>,
) =>
(
  res: Result<In, PrevErr>,
): Result<In & { [K in Name]: Out }, Err | PrevErr> => {
  if (!res.ok) {
    return res;
  }
  const next = fn(res.val);
  if (next.ok) {
    return ok({ ...res.val, [name]: next.val } as In & { [K in Name]: Out });
  }
  return next;
};

export const combine = <
  T extends Record<string | number | symbol, unknown>,
  E,
>(results: { [K in keyof T]: Result<T[K], E> }): Result<
  T,
  ReadonlyArray<E>
> => {
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
};

export const all = <T extends [unknown, ...unknown[]], E>(
  results: {
    [K in keyof T]: Result<T[K], E>;
  },
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
};

export const andThrough =
  <T1, E1, T2, E2>(sideEffect: (input: T1) => Result<T2, E2>) => (res: Result<T1, E1>): Result<T1, E1 | E2> => {
    if (!res.ok) {
      return res;
    }
    const next = sideEffect(res.val);
    if (next.ok) {
      return res;
    }
    return next;
  };

export { flow, pipe };
