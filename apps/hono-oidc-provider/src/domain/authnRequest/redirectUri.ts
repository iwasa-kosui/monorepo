import { z } from "zod/v4";
import { Parser } from "../../helper/parser.js";

const RedirectUriSymbol = Symbol('RedirectUri');
const schema = z.url().brand(RedirectUriSymbol).describe('RedirectUri');
export type RedirectUri = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<RedirectUri, string>(schema);
export const RedirectUri = {
  schema,
  ...parser,
} as const;
