import { z } from "zod/v4";
import { Parser } from "../../helper/parser.js";

const ClientNameSymbol = Symbol('ClientName');
const schema = z.string().min(1).brand(ClientNameSymbol).describe('ClientName');
export type ClientName = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<ClientName, string>(schema);
export const ClientName = {
  schema,
  ...parser,
} as const;
