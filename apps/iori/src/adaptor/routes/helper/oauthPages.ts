import { html } from 'hono/html';

import type { OAuthApplication } from '../../../domain/oauth/oauthApplication.ts';
import type { Scope } from '../../../domain/oauth/scope.ts';

export type ConsentPageProps = Readonly<{
  application: OAuthApplication;
  scopes: ReadonlyArray<Scope>;
  hiddenFields: ReadonlyArray<readonly [string, string]>;
}>;

const layout = (title: string, body: unknown) =>
  html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="robots" content="noindex">
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1.5rem; line-height: 1.6; }
      ul { padding-left: 1.5rem; }
      .actions { display: flex; gap: 1rem; margin-top: 2rem; }
      button { font: inherit; padding: 0.6rem 1.4rem; cursor: pointer; }
      code { word-break: break-all; }
    </style>
  </head>
  <body>${body}</body>
</html>`;

export const renderConsentPage = ({ application, scopes, hiddenFields }: ConsentPageProps) =>
  layout(
    'Authorize application',
    html`
    <h1>Authorize ${application.name}</h1>
    <p>${application.name} is requesting access to your account.</p>
    ${application.website === null ? '' : html`<p>Website: ${application.website}</p>`}
    <p>It will be able to:</p>
    <ul>${scopes.map((scope) => html`<li><code>${scope}</code></li>`)}</ul>
    <form method="post" action="/oauth/authorize">
      ${hiddenFields.map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}">`)}
      <div class="actions">
        <button type="submit" name="decision" value="approve">Authorize</button>
        <button type="submit" name="decision" value="deny">Deny</button>
      </div>
    </form>`,
  );

export const renderOobCodePage = (code: string) =>
  layout(
    'Authorization code',
    html`
    <h1>Authorization code</h1>
    <p>Copy this code and paste it into the application.</p>
    <p><code>${code}</code></p>`,
  );

export const renderErrorPage = (message: string) =>
  layout(
    'Authorization error',
    html`
    <h1>Authorization error</h1>
    <p>${message}</p>`,
  );
