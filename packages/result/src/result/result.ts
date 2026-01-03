import { flow, pipe } from "@iwasa-kosui/pipe/src/index.js";

type Ok<T, E> = Readonly<{
  ok: true;
  val: T;
  err: never;
}>;

type Err<T, E> = Readonly<{
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

export const map =
  <T, T2>(fn: (input: T) => T2) =>
    <E>(res: Result<T, E>): Result<T2, E> =>
      res.ok ? ok(fn(res.val)) : res;

export const mapErr =
  <PrevErr, Err>(fn: (err: PrevErr) => Err) =>
    <In>(res: Result<In, PrevErr>): Result<In, Err> =>
      res.ok ? res : err(fn(res.err));

export const unwrapOr =
  <T, E, T2>(defaultVal: T2) =>
    (res: Result<T, E>): T | T2 =>
      res.ok ? res.val : defaultVal;

export const andThen =
  <T1, E1, T2, E2>(fn: (input: T1) => Result<T2, E2>) =>
    (res: Result<T1, E1>): Result<T2, E1 | E2> =>
      res.ok ? fn(res.val) : res;

export const orElse =
  <T1, E1, T2, E2>(fn: (input: E1) => Result<T2, E2>) =>
    (res: Result<T1, E1>): Result<T1 | T2, E2> =>
      res.ok ? res : fn(res.err);

export const unsafeUnwrap = <T, E>(res: Result<T, E>): T => {
  if (res.ok) {
    return res.val;
  }
  throw new Error("Tried to unwrap an Err value");
};

export const unsafeUnwrapErr = <T, E>(res: Result<T, E>): E => {
  if (!res.ok) {
    return res.err;
  }
  throw new Error("Tried to unwrapErr an Ok value");
};

export const match =
  <T, E, R1, R2>(opts: { ok: (val: T) => R1; err: (err: E) => R2 }) =>
    (res: Result<T, E>): R1 | R2 =>
      res.ok ? opts.ok(res.val) : opts.err(res.err);

type Bind = <
  Name extends string,
  In,
  Out,
  Err,
  PrevErr
>(
  name: Name,
  fn: (input: In) => Result<Out, Err>
) => (
  res: Result<In, PrevErr>
) => Result<In & { [K in Name]: Out }, Err | PrevErr>;

export const bind: Bind =
  <
    Name extends string,
    In,
    Out,
    Err,
    PrevErr
  >(
    name: Name,
    fn: (input: In) => Result<Out, Err>
  ) => (
    res: Result<In, PrevErr>
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
  E
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

export const all = <T extends [unknown, ...unknown[]], E>(results: {
  [K in keyof T]: Result<T[K], E>;
}): Result<T, ReadonlyArray<E>> => {
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
  <T1, E1, T2, E2>(sideEffect: (input: T1) => Result<T2, E2>) =>
    (res: Result<T1, E1>): Result<T1, E1 | E2> => {
      if (!res.ok) {
        return res;
      }
      const next = sideEffect(res.val);
      if (next.ok) {
        return res;
      }
      return next;
    };

export const okAsync = async <T>(
  val: T | Promise<T>
): Promise<Ok<T, never>> => ({
  ok: true,
  val: await val,
  err: undefined as never,
});

export const errAsync = async <E>(
  err: E | Promise<E>
): Promise<Err<never, E>> => ({
  ok: false,
  err: await err,
  val: undefined as never,
});

export const mapAsync =
  <T, T2>(fn: ((input: T) => Promise<T2>) | ((input: T) => T2)) =>
    async <E>(
      res: Result<T, E> | Promise<Result<T, E>>
    ): Promise<Result<T2, E>> => {
      const awaited = await res;
      return awaited.ok ? ok(await fn(awaited.val)) : awaited;
    };

export const mapErrAsync =
  <E, E2>(fn: ((input: E) => Promise<E2>) | ((input: E) => E2)) =>
    async <T>(
      res: Result<T, E> | Promise<Result<T, E>>
    ): Promise<Result<T, E2>> => {
      const awaited = await res;
      return awaited.ok ? awaited : errAsync(await fn(awaited.err));
    };

export const andThenAsync =
  <T1, E1, T2, E2>(
    fn:
      | ((input: T1) => Promise<Result<T2, E2>>)
      | ((input: T1) => Result<T2, E2>)
  ) =>
    async (
      res: Result<T1, E1> | Promise<Result<T1, E1>>
    ): Promise<Result<T2, E1 | E2>> => {
      const awaited = await res;
      return awaited.ok ? fn(awaited.val) : awaited;
    };

export const orElseAsync =
  <T1, E1, T2, E2>(
    fn:
      | ((input: E1) => Promise<Result<T2, E2>>)
      | ((input: E1) => Result<T2, E2>)
  ) =>
    async (
      res: Result<T1, E1> | Promise<Result<T1, E1>>
    ): Promise<Result<T1 | T2, E2>> => {
      const awaited = await res;
      return awaited.ok ? awaited : fn(awaited.err);
    };

export const matchAsync =
  <T, E, R1, R2>(opts: {
    ok: ((val: T) => Promise<R1>) | ((val: T) => R1);
    err: ((err: E) => Promise<R2>) | ((err: E) => R2);
  }) =>
    async (res: Result<T, E> | Promise<Result<T, E>>): Promise<R1 | R2> => {
      const awaited = await res;
      return awaited.ok ? opts.ok(awaited.val) : opts.err(awaited.err);
    };

export const bindAsync =
  <Name extends string, In, Out, Err>(
    name: Name,
    fn: ((input: In) => Promise<Result<Out, Err>>) | ((input: In) => Result<Out, Err>)
  ) =>
    async <PrevErr>(
      res: Result<In, PrevErr> | Promise<Result<In, PrevErr>>
    ): Promise<Result<In & { [K in Name]: Out }, Err | PrevErr>> => {
      const awaited = await res;
      if (!awaited.ok) {
        return awaited;
      }

      const next = await fn(awaited.val);
      if (next.ok) {
        return ok({ ...awaited.val, [name]: next.val } as In & {
          [K in Name]: Out;
        });
      }
      return next;
    };

type AllAsync = {
  <T extends [unknown, ...unknown[]], E>(results: {
    [K in keyof T]: Promise<Result<T[K], E>>;
  }): Promise<Result<T, ReadonlyArray<E>>>;

  <T extends unknown[], E>(results: {
    [K in keyof T]: Promise<Result<T[K], E>>;
  }): Promise<Result<T, ReadonlyArray<E>>>;
}

export const allAsync: AllAsync = async <T extends [unknown, ...unknown[]], E>(results: {
  [K in keyof T]: Promise<Result<T[K], E>>;
}): Promise<Result<T, ReadonlyArray<E>>> => {
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

export const andThroughAsync =
  <T1, E1, T2, E2>(sideEffect: (input: T1) => Promise<Result<T2, E2>>) =>
    async (
      res: Result<T1, E1> | Promise<Result<T1, E1>>
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

export { flow, pipe };
