import { z } from "zod/v4";
import { Parser } from "../../helper/parser.js";

const ClientIdSymbol = Symbol('ClientId');
const schema = z.string().min(1).brand(ClientIdSymbol).describe('ClientId');
export type ClientId = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<ClientId, string>(schema);
/**
 * ClientId はクライアントを一意に識別するための文字列であり、変更されないことが求められます。
 * また、既に存在するクライアントと衝突しないように設計されなければなりません。
 * ClientId はクライアント登録時に発行され、その後変更されることはありません。
 */
export const ClientId = {
  schema,
  ...parser,
} as const;
