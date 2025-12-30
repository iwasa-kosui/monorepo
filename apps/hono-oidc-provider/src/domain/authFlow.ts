import type { AuthnRequest } from "./authnRequest/authnRequest.js";
import type { Instant } from "./instant.js";
import type { StandardScope } from "./scope/scope.js";
import type { Subject } from "./user/subject.js";

type NonEmptyArray<T> = [T, ...T[]];

/**
 * 認証フローを開始した状態を表します。
 * この状態では、ユーザーはまだアカウントの選択、ログイン、または同意を行っていません。
 * ただし、認証リクエストは検証済みであり、必要なスコープが含まれています。
 */
type AuthFlowStarted = Readonly<{
  kind: 'AuthFlowStarted';
  request: AuthnRequest & {
    scopes: AuthnRequest['scopes'] & NonEmptyArray<StandardScope>
  };
  selectAccount?: undefined;
  login?: undefined;
  consent?: undefined;
}>;

/**
 * ユーザーがアカウントを選択した状態を表します。
 * この状態では、ユーザーはアカウントの選択を完了していますが、まだログインまたは同意を行っていません。
 */
type AuthFlowAccountSelected = Readonly<{
  kind: 'AuthFlowAccountSelected';
  request: AuthnRequest & {
    scopes: AuthnRequest['scopes'] & NonEmptyArray<StandardScope>
  };
  selectAccount: {
    subject: Subject;
  };
  login?: undefined;
  consent?: undefined;
}>;

/**
 * ユーザーがログインした状態を表します。
 * この状態では、ユーザーはアカウントの選択とログインを完了していますが、まだ同意を行っていません。
 */
type AuthFlowLoggedIn = Readonly<{
  kind: 'AuthFlowLoggedIn';
  request: AuthnRequest & {
    scopes: AuthnRequest['scopes'] & NonEmptyArray<StandardScope>
  };
  selectAccount: {
    subject: Subject;
  };
  login: {
    authenticatedAt: Instant;
  };
  consent?: undefined;
}>;

/**
 * ユーザーが同意を与えた状態を表します。
 * この状態では、ユーザーはアカウントの選択、ログイン、および同意を完了しています。
 */
type AuthFlowConsented = Readonly<{
  kind: 'AuthFlowConsented';
  request: AuthnRequest & {
    scopes: AuthnRequest['scopes'] & NonEmptyArray<StandardScope>
  };
  selectAccount: {
    subject: Subject;
  };
  login: {
    authenticatedAt: Instant;
  };
  consent: {
    grantedScopes: NonEmptyArray<StandardScope>;
  };
}>;

export type AuthFlow =
  | AuthFlowStarted
  | AuthFlowAccountSelected
  | AuthFlowLoggedIn
  | AuthFlowConsented;
