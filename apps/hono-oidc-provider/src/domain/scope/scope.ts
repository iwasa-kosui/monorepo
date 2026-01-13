import z from "zod/v4";
import { Parser } from "../../helper/parser.js";

const openid = 'openid';
const profile = 'profile';
const email = 'email';
const offlineAccess = 'offline_access';
const values = {
  openid,
  profile,
  email,
  offlineAccess,
} as const;

const schema = z.enum(values);
export type StandardScope = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<StandardScope, string>(schema);
export const StandardScope = {
  schema,
  ...parser,
  ...values,
} as const;
