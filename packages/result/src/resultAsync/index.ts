import { ResultAsync as Module } from "./module.js";

type ResultAsync<T, E> = Module.ResultAsync<T, E>;
const ResultAsync = Module;
export { ResultAsync, ResultAsync as RA };
