export * from "./result.js"
import { Result as Module } from "./module.js";

type Result<T, E> = Module.Result<T, E>;
const Result = Module;

export { Result };
