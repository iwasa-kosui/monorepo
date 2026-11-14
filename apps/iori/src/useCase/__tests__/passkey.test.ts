import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasskeyCredentialId } from '../../domain/passkey/passkeyCredentialId.ts';
import type { Argon2idDerive } from '../../domain/password/argon2idDerive.ts';
import { Password } from '../../domain/password/password.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { createSoftwareAuthenticator } from '../../testing/softwareAuthenticator.ts';
import { DeletePasskeyUseCase } from '../deletePasskey.ts';
import { FinishPasskeyAuthenticationUseCase } from '../finishPasskeyAuthentication.ts';
import { FinishPasskeyRegistrationUseCase } from '../finishPasskeyRegistration.ts';
import { ListPasskeysUseCase } from '../listPasskeys.ts';
import { StartPasskeyAuthenticationUseCase } from '../startPasskeyAuthentication.ts';
import { StartPasskeyRegistrationUseCase } from '../startPasskeyRegistration.ts';
import {
  createMockSessionStartedStore,
  createMockUserPasswordResolver,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';
import { createPasskeyInMemory } from './helper/passkeyInMemory.ts';

const origin = 'https://iori.test';
const rpId = 'iori.test';
const password = Password.orThrow('securepassword1234');

const fakeDerive: Argon2idDerive = async ({ password: bytes, salt, tagLength }) => {
  const input = new Uint8Array([...bytes, ...salt]);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Uint8Array.from({ length: tagLength }, (_, index) => digest[index % digest.length]!);
};

const setup = async () => {
  const memory = createPasskeyInMemory();
  const user = { id: UserId.generate(), username: Username.orThrow('kosui') };
  const userResolver = createMockUserResolver(new Map([[user.id, user]]));
  const userPasswordResolver = createMockUserPasswordResolver();
  userPasswordResolver.setPassword(user.id, await Password.hashPassword(fakeDerive)(password));
  const sessionStartedStore = createMockSessionStartedStore();

  const startRegistration = StartPasskeyRegistrationUseCase.create({
    userResolver,
    userPasswordResolver,
    passkeyCredentialsResolverByUserId: memory.passkeyCredentialsResolverByUserId,
    webAuthnChallengeIssuedStore: memory.webAuthnChallengeIssuedStore,
    argon2idDerive: fakeDerive,
    rpId,
  });
  const finishRegistration = FinishPasskeyRegistrationUseCase.create({
    webAuthnChallengeConsumer: memory.webAuthnChallengeConsumer,
    passkeyCredentialResolverByCredentialId: memory.passkeyCredentialResolverByCredentialId,
    passkeyRegisteredStore: memory.passkeyRegisteredStore,
    rpId,
    origin,
  });
  const startAuthentication = StartPasskeyAuthenticationUseCase.create({
    webAuthnChallengeIssuedStore: memory.webAuthnChallengeIssuedStore,
    rpId,
  });
  const finishAuthentication = FinishPasskeyAuthenticationUseCase.create({
    webAuthnChallengeConsumer: memory.webAuthnChallengeConsumer,
    passkeyCredentialResolverByCredentialId: memory.passkeyCredentialResolverByCredentialId,
    passkeyUsedStore: memory.passkeyUsedStore,
    sessionStartedStore,
    rpId,
    origin,
  });
  const listPasskeys = ListPasskeysUseCase.create({
    passkeyCredentialsResolverByUserId: memory.passkeyCredentialsResolverByUserId,
  });
  const deletePasskey = DeletePasskeyUseCase.create({
    passkeyCredentialResolverByCredentialId: memory.passkeyCredentialResolverByCredentialId,
    passkeyDeletedStore: memory.passkeyDeletedStore,
  });

  const authenticator = await createSoftwareAuthenticator();

  const beginRegistration = async () => {
    const started = await startRegistration.run({ userId: user.id, password });
    if (!started.ok) throw new Error(`unexpected ${started.err.type}`);
    return started.val;
  };
  const registrationResponse = async (challenge: string): Promise<RegistrationResponseJSON> =>
    authenticator.createRegistrationResponse({ challenge, origin, rpId });
  const register = async (name?: string) => {
    const { options, challengeId } = await beginRegistration();
    const response = await registrationResponse(options.challenge);
    return finishRegistration.run({ userId: user.id, challengeId, response, name });
  };
  const beginAuthentication = async () => {
    const started = await startAuthentication.run({});
    if (!started.ok) throw new Error('unexpected');
    return started.val;
  };
  const authenticationResponse = async (
    challenge: string,
    params: Partial<{ counter: number; userHandle: string; origin: string }> = {},
  ): Promise<AuthenticationResponseJSON> =>
    authenticator.createAuthenticationResponse({ challenge, origin, rpId, ...params });

  return {
    ...memory,
    user,
    sessionStartedStore,
    authenticator,
    startRegistration,
    finishRegistration,
    finishAuthentication,
    listPasskeys,
    deletePasskey,
    beginRegistration,
    registrationResponse,
    register,
    beginAuthentication,
    authenticationResponse,
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('StartPasskeyRegistrationUseCase', () => {
  it('パスワードが合わないと InvalidPassword を返し、challenge を保存しない', async () => {
    const h = await setup();

    const result = await h.startRegistration.run({
      userId: h.user.id,
      password: Password.orThrow('wrongpassword12345'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('InvalidPassword');
    expect(h.challenges.size).toBe(0);
  });

  it('パスワードが未設定のユーザーは InvalidPassword を返す', async () => {
    const h = await setup();
    const userId = UserId.generate();
    const useCase = StartPasskeyRegistrationUseCase.create({
      userResolver: createMockUserResolver(new Map([[userId, { id: userId, username: h.user.username }]])),
      userPasswordResolver: createMockUserPasswordResolver(),
      passkeyCredentialsResolverByUserId: h.passkeyCredentialsResolverByUserId,
      webAuthnChallengeIssuedStore: h.webAuthnChallengeIssuedStore,
      argon2idDerive: fakeDerive,
      rpId,
    });

    const result = await useCase.run({ userId, password });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('InvalidPassword');
  });

  it('登録用の challenge を userId 付きで保存し、5 分で失効させる', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const h = await setup();

    const { options, challengeId } = await h.beginRegistration();

    expect(options.rp).toMatchObject({ name: 'iori', id: rpId });
    expect(options.user.name).toBe('kosui');
    expect(isoBase64URL.toUTF8String(options.user.id)).toBe(h.user.id);
    expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
    expect(options.attestation).toBe('none');
    expect(h.challenges.get(challengeId)).toMatchObject({
      challenge: options.challenge,
      purpose: 'registration',
      userId: h.user.id,
      expires: new Date('2026-11-01T00:05:00Z').getTime(),
    });
  });

  it('登録済みの資格情報を excludeCredentials に入れる', async () => {
    const h = await setup();
    await h.register();

    const { options } = await h.beginRegistration();

    expect(options.excludeCredentials?.map(({ id }) => id)).toEqual([h.authenticator.credentialId]);
  });

  it('新しい challenge を発行するとき、期限切れの challenge を消す', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const h = await setup();
    const first = await h.beginRegistration();

    vi.setSystemTime(new Date('2026-11-01T00:06:00Z'));
    const second = await h.beginRegistration();

    expect(h.challenges.has(first.challengeId)).toBe(false);
    expect(h.challenges.has(second.challengeId)).toBe(true);
  });
});

describe('FinishPasskeyRegistrationUseCase', () => {
  it('登録できる。name を省略すると登録日時の文字列になる', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const h = await setup();

    const result = await h.register();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val.credential).toMatchObject({
      credentialId: h.authenticator.credentialId,
      userId: h.user.id,
      counter: 0,
      name: '2026-11-01T00:00:00.000Z',
      lastUsedAt: null,
    });
    expect(h.credentials.size).toBe(1);
  });

  it('challenge は 1 回しか使えない', async () => {
    const h = await setup();
    const { options, challengeId } = await h.beginRegistration();
    const response = await h.registrationResponse(options.challenge);

    const first = await h.finishRegistration.run({ userId: h.user.id, challengeId, response });
    const second = await h.finishRegistration.run({ userId: h.user.id, challengeId, response });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.err.type).toBe('WebAuthnChallengeInvalidError');
  });

  it('期限切れの challenge は失敗する', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const h = await setup();
    const { options, challengeId } = await h.beginRegistration();
    const response = await h.registrationResponse(options.challenge);

    vi.setSystemTime(new Date('2026-11-01T00:05:01Z'));
    const result = await h.finishRegistration.run({ userId: h.user.id, challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('WebAuthnChallengeInvalidError');
    expect(h.credentials.size).toBe(0);
  });

  it('purpose が違う challenge は失敗する', async () => {
    const h = await setup();
    const { options, challengeId } = await h.beginAuthentication();
    const response = await h.registrationResponse(options.challenge);

    const result = await h.finishRegistration.run({ userId: h.user.id, challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('WebAuthnChallengeInvalidError');
  });

  it('別のユーザーが発行した challenge は失敗する', async () => {
    const h = await setup();
    const { options, challengeId } = await h.beginRegistration();
    const response = await h.registrationResponse(options.challenge);

    const result = await h.finishRegistration.run({ userId: UserId.generate(), challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('WebAuthnChallengeInvalidError');
    expect(h.credentials.size).toBe(0);
  });

  it('challenge が違う応答は PasskeyVerificationFailedError になる', async () => {
    const h = await setup();
    const { challengeId } = await h.beginRegistration();
    const other = await h.beginRegistration();
    const response = await h.registrationResponse(other.options.challenge);

    const result = await h.finishRegistration.run({ userId: h.user.id, challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('PasskeyVerificationFailedError');
    expect(h.credentials.size).toBe(0);
  });

  it('同じ credentialId は二重に登録できない', async () => {
    const h = await setup();
    await h.register();

    const result = await h.register();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('PasskeyAlreadyRegisteredError');
    expect(h.credentials.size).toBe(1);
  });
});

describe('FinishPasskeyAuthenticationUseCase', () => {
  it('ログインしてセッションを開始し、counter と lastUsedAt を更新する', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const h = await setup();
    await h.register();
    vi.setSystemTime(new Date('2026-11-02T00:00:00Z'));
    const { options, challengeId } = await h.beginAuthentication();
    const response = await h.authenticationResponse(options.challenge, {
      counter: 7,
      userHandle: isoBase64URL.fromUTF8String(h.user.id),
    });

    const result = await h.finishAuthentication.run({ challengeId, response });

    expect(result.ok).toBe(true);
    expect(h.credentials.get(h.authenticator.credentialId)).toMatchObject({
      counter: 7,
      lastUsedAt: new Date('2026-11-02T00:00:00Z').getTime(),
    });
    expect(h.sessionStartedStore.store).toHaveBeenCalledTimes(1);
    expect(h.sessionStartedStore.items[0]).toMatchObject({
      aggregateState: {
        userId: h.user.id,
        expires: new Date('2026-11-09T00:00:00Z').getTime(),
        sessionId: result.ok ? result.val.sessionId : undefined,
      },
    });
  });

  it('challenge は 1 回しか使えない', async () => {
    const h = await setup();
    await h.register();
    const { options, challengeId } = await h.beginAuthentication();
    const response = await h.authenticationResponse(options.challenge);

    const first = await h.finishAuthentication.run({ challengeId, response });
    const second = await h.finishAuthentication.run({ challengeId, response });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.err.type).toBe('WebAuthnChallengeInvalidError');
    expect(h.sessionStartedStore.store).toHaveBeenCalledTimes(1);
  });

  it('期限切れの challenge は失敗する', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const h = await setup();
    await h.register();
    const { options, challengeId } = await h.beginAuthentication();
    const response = await h.authenticationResponse(options.challenge);

    vi.setSystemTime(new Date('2026-11-01T00:05:01Z'));
    const result = await h.finishAuthentication.run({ challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('WebAuthnChallengeInvalidError');
    expect(h.sessionStartedStore.store).not.toHaveBeenCalled();
  });

  it('登録用の challenge ではログインできない', async () => {
    const h = await setup();
    await h.register();
    const { options, challengeId } = await h.beginRegistration();
    const response = await h.authenticationResponse(options.challenge);

    const result = await h.finishAuthentication.run({ challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('WebAuthnChallengeInvalidError');
  });

  it('未登録の資格情報は PasskeyCredentialNotFoundError になる', async () => {
    const h = await setup();
    const { options, challengeId } = await h.beginAuthentication();
    const response = await h.authenticationResponse(options.challenge);

    const result = await h.finishAuthentication.run({ challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('PasskeyCredentialNotFoundError');
    expect(h.sessionStartedStore.store).not.toHaveBeenCalled();
  });

  it('userHandle が資格情報の持ち主と違うと失敗する', async () => {
    const h = await setup();
    await h.register();
    const { options, challengeId } = await h.beginAuthentication();
    const response = await h.authenticationResponse(options.challenge, {
      userHandle: isoBase64URL.fromUTF8String(UserId.generate()),
    });

    const result = await h.finishAuthentication.run({ challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('PasskeyUserHandleMismatchError');
    expect(h.sessionStartedStore.store).not.toHaveBeenCalled();
  });

  it('challenge が違う応答は PasskeyVerificationFailedError になり、セッションを開始しない', async () => {
    const h = await setup();
    await h.register();
    const { challengeId } = await h.beginAuthentication();
    const other = await h.beginAuthentication();
    const response = await h.authenticationResponse(other.options.challenge);

    const result = await h.finishAuthentication.run({ challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('PasskeyVerificationFailedError');
    expect(h.sessionStartedStore.store).not.toHaveBeenCalled();
  });

  it('origin が違う応答は失敗する', async () => {
    const h = await setup();
    await h.register();
    const { options, challengeId } = await h.beginAuthentication();
    const response = await h.authenticationResponse(options.challenge, { origin: 'https://evil.example' });

    const result = await h.finishAuthentication.run({ challengeId, response });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('PasskeyVerificationFailedError');
  });

  it('counter が戻る応答は失敗し、counter を更新しない', async () => {
    const h = await setup();
    await h.register();
    const first = await h.beginAuthentication();
    await h.finishAuthentication.run({
      challengeId: first.challengeId,
      response: await h.authenticationResponse(first.options.challenge, { counter: 10 }),
    });
    const second = await h.beginAuthentication();

    const result = await h.finishAuthentication.run({
      challengeId: second.challengeId,
      response: await h.authenticationResponse(second.options.challenge, { counter: 5 }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('PasskeyVerificationFailedError');
    expect(h.credentials.get(h.authenticator.credentialId)?.counter).toBe(10);
    expect(h.sessionStartedStore.store).toHaveBeenCalledTimes(1);
  });
});

describe('ListPasskeysUseCase と DeletePasskeyUseCase', () => {
  it('自分の資格情報だけを一覧する', async () => {
    const h = await setup();
    await h.register();

    const own = await h.listPasskeys.run({ userId: h.user.id });
    const other = await h.listPasskeys.run({ userId: UserId.generate() });

    expect(own.ok && own.val.credentials.map(({ credentialId }) => credentialId)).toEqual([
      h.authenticator.credentialId,
    ]);
    expect(other.ok && other.val.credentials).toEqual([]);
  });

  it('自分の資格情報を削除できる', async () => {
    const h = await setup();
    await h.register();

    const result = await h.deletePasskey.run({
      userId: h.user.id,
      credentialId: PasskeyCredentialId.orThrow(h.authenticator.credentialId),
    });

    expect(result.ok).toBe(true);
    expect(h.credentials.size).toBe(0);
  });

  it('他人の資格情報は NotFound になり、削除されない', async () => {
    const h = await setup();
    await h.register();

    const result = await h.deletePasskey.run({
      userId: UserId.generate(),
      credentialId: PasskeyCredentialId.orThrow(h.authenticator.credentialId),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('PasskeyCredentialNotFoundError');
    expect(h.credentials.size).toBe(1);
  });
});
