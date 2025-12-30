import { z } from "zod/v4";
import { Parser } from "../../helper/parser.js";

const UsernameSymbol = Symbol('Username');
const schema = z.string().min(1).brand(UsernameSymbol).describe('Username');
export type Username = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<Username, string>(schema);

/**
 * Username はユーザーがログイン時に使用する識別子であり、一意である必要があります。
 * ただし、Subject とは異なり、将来的に変更される可能性があります。
 * 加えて、過去に存在したユーザー名が再利用されることも許容されます。
 */
export const Username = {
  schema,
  ...parser,
} as const;
