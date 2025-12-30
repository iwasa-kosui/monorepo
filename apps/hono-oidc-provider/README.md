# hono-oidc-provider

OpenID Connect Provider implementation using Hono framework.

> [^WARNING]: This is a work in progress and not yet production-ready.

## Features

### Supported Flows

#### Scoped

- [ ] Authorization Code Flow
- [ ] Refresh Token Flow

#### Unscoped

- Implicit Flow
- Hybrid Flow
- Client Credentials Flow

### Supported Endpoints

#### Scoped

- [ ] Authorization Endpoint
- [ ] Token Endpoint
- [ ] Introspection Endpoint
- [ ] JWKS Endpoint

#### Unscoped

- [ ] UserInfo Endpoint
- [ ] Revocation Endpoint

### Supported Authentication Request Parameters

#### Scoped

- [ ] scope
- [ ] response_mode
- [ ] response_type
- [ ] prompt
- [ ] client_id
- [ ] redirect_uri
- [ ] state
- [ ] code_challenge
- [ ] code_challenge_method

#### Unscoped

- [ ] nonce
- [ ] display
- [ ] max_age
- [ ] ui_locales
- [ ] id_token_hint
- [ ] login_hint
- [ ] acr_values

## Getting Started

```
npm install
npm run dev
```

```
open http://localhost:3000
```
