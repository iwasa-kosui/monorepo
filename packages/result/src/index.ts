export * from "./result.js"
import { Result as ModuleResult } from "./module.js";

type Result<T, E> = ModuleResult.Result<T, E>;
const Result = ModuleResult;

export { Result };
