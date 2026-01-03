import { allAsync, andThenAsync, errAsync, flow, mapAsync, mapErrAsync, matchAsync, okAsync, orElseAsync, pipe, Result, andThroughAsync, bindAsync } from "../result/result.js";

export type ResultAsync<T, E> = Promise<Result<T, E>>;
export const ok = okAsync;
export const err = errAsync;
export const map = mapAsync;
export const mapErr = mapErrAsync;
export const andThen = andThenAsync;
export const orElse = orElseAsync;
export const match = matchAsync;
export const bind = bindAsync;
export const all = allAsync;
export const andThrough = andThroughAsync;
export { flow, pipe };
