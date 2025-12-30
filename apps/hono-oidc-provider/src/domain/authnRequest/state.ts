import z from "zod";
import { Parser } from "../../helper/parser.js";

const StateSymbol = Symbol('State');
const schema = z.string().min(1).brand(StateSymbol).describe('State');
export type State = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<State, string>(schema);

export const State = {
  schema,
  ...parser,
} as const;
