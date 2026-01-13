import { z } from "zod/v4";
import { ClientId } from "../client/clientId.js";
import { Parser } from "../../helper/parser.js";
import { StandardScope } from "../scope/scope.js";
import { RedirectUri } from "./redirectUri.js";
import { State } from "./state.js";

/**
 * AuthnRequest は認証リクエストを表すオブジェクトです。
 */

const schema = z.object({
  clientId: ClientId.schema,
  /**
   * REQUIRED. OpenID Connect requests MUST contain the openid scope value.
   */
  scopes: z.array(StandardScope.schema),
  /**
   * REQUIRED. OAuth 2.0 Response Type value that determines the authorization processing flow
   * to be used, including what parameters are returned from the endpoints used.
   */
  responseType: z.literal('code'),
  /**
   * REQUIRED. Redirection URI to which the response will be sent.
   */
  redirectUri: RedirectUri.schema,
  /**
   * RECOMMENDED. Opaque value used to maintain state between the request and the callback.
   */
  state: State.schema.optional(),
});
export type AuthnRequest = z.output<typeof schema>;

const parser = Parser.fromStandardSchema<AuthnRequest, unknown>(schema);
export const AuthnRequest = {
  schema,
  ...parser,
} as const;
