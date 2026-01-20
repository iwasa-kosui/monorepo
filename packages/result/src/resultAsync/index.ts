import { ResultAsync as Module } from './module.js';

type ResultAsync<T, E> = Module.ResultAsync<T, E>;
const ResultAsync = Module;
// eslint-disable-next-line simple-import-sort/exports
export { ResultAsync, ResultAsync as RA };
