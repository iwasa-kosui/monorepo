import type { OAuthApplicationResolverByClientId } from '../domain/oauth/oauthApplication.ts';
import {
  type AuthorizationRequestError,
  type AuthorizationRequestInput,
  validateAuthorizationRequestWith,
  type ValidatedAuthorizationRequest,
} from './helper/authorizationRequest.ts';
import type { UseCase } from './useCase.ts';

export type ValidateAuthorizationRequestUseCase = UseCase<
  AuthorizationRequestInput,
  ValidatedAuthorizationRequest,
  AuthorizationRequestError
>;

type Deps = Readonly<{
  oauthApplicationResolverByClientId: OAuthApplicationResolverByClientId;
}>;

const create = ({ oauthApplicationResolverByClientId }: Deps): ValidateAuthorizationRequestUseCase => ({
  run: async (input) => validateAuthorizationRequestWith(oauthApplicationResolverByClientId)(input),
});

export const ValidateAuthorizationRequestUseCase = {
  create,
} as const;
