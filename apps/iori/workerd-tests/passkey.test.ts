import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1PasskeyCredentialResolverByCredentialId } from '../src/adaptor/d1/passkey/passkeyCredentialResolverByCredentialId.ts';
import { createD1PasskeyCredentialsResolverByUserId } from '../src/adaptor/d1/passkey/passkeyCredentialsResolverByUserId.ts';
import { createD1PasskeyDeletedStore } from '../src/adaptor/d1/passkey/passkeyDeletedStore.ts';
import { createD1PasskeyRegisteredStore } from '../src/adaptor/d1/passkey/passkeyRegisteredStore.ts';
import { createD1PasskeyUsedStore } from '../src/adaptor/d1/passkey/passkeyUsedStore.ts';
import { createD1WebAuthnChallengeConsumer } from '../src/adaptor/d1/passkey/webAuthnChallengeConsumer.ts';
import { createD1WebAuthnChallengeIssuedStore } from '../src/adaptor/d1/passkey/webAuthnChallengeIssuedStore.ts';
import { createD1SessionResolver } from '../src/adaptor/d1/session/sessionResolver.ts';
import { createD1SessionStartedStore } from '../src/adaptor/d1/session/sessionStartedStore.ts';
import { createD1UserResolver } from '../src/adaptor/d1/user/userResolver.ts';
import { createD1UserPasswordResolver } from '../src/adaptor/d1/userPassword/userPasswordResolver.ts';
import { PasskeyCredentialId } from '../src/domain/passkey/passkeyCredentialId.ts';
import type { Argon2idDerive } from '../src/domain/password/argon2idDerive.ts';
import { Password } from '../src/domain/password/password.ts';
import { UserId } from '../src/domain/user/userId.ts';
import { createSoftwareAuthenticator } from '../src/testing/softwareAuthenticator.ts';
import { DeletePasskeyUseCase } from '../src/useCase/deletePasskey.ts';
import { FinishPasskeyAuthenticationUseCase } from '../src/useCase/finishPasskeyAuthentication.ts';
import { FinishPasskeyRegistrationUseCase } from '../src/useCase/finishPasskeyRegistration.ts';
import { ListPasskeysUseCase } from '../src/useCase/listPasskeys.ts';
import { StartPasskeyAuthenticationUseCase } from '../src/useCase/startPasskeyAuthentication.ts';
import { StartPasskeyRegistrationUseCase } from '../src/useCase/startPasskeyRegistration.ts';

const origin = 'http://localhost:8787';
const rpID = 'localhost';

const register = async () => {
  const authenticator = await createSoftwareAuthenticator();
  const options = await generateRegistrationOptions({
    rpName: 'iori',
    rpID,
    userName: 'kosui',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  const response = await authenticator.createRegistrationResponse({ challenge: options.challenge, origin, rpId: rpID });
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: options.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  return { authenticator, verification };
};

describe('@simplewebauthn/server on workerd', () => {
  it('登録の応答を検証できる', async () => {
    const { authenticator, verification } = await register();

    expect(verification.verified).toBe(true);
    expect(verification.registrationInfo?.credential.id).toBe(authenticator.credentialId);
    expect(verification.registrationInfo?.credential.counter).toBe(0);
  });

  it('認証の応答を検証し、カウンターを更新する', async () => {
    const { authenticator, verification } = await register();
    const credential = verification.registrationInfo!.credential;
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    const response = await authenticator.createAuthenticationResponse({
      challenge: options.challenge,
      origin,
      rpId: rpID,
      counter: 5,
    });

    const authentication = await verifyAuthenticationResponse({
      response,
      expectedChallenge: options.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
      requireUserVerification: true,
    });

    expect(authentication.verified).toBe(true);
    expect(authentication.authenticationInfo.newCounter).toBe(5);
  });

  it('challenge が違う応答は検証に失敗する', async () => {
    const { authenticator, verification } = await register();
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    const other = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    const response = await authenticator.createAuthenticationResponse({
      challenge: other.challenge,
      origin,
      rpId: rpID,
    });

    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: options.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: verification.registrationInfo!.credential,
        requireUserVerification: true,
      }),
    ).rejects.toThrow();
  });
});

const fakeDerive: Argon2idDerive = async ({ password, salt, tagLength }) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...password, ...salt])));
  return Uint8Array.from({ length: tagLength }, (_, index) => digest[index % digest.length]!);
};

describe('passkey の D1 ストアとリゾルバー', () => {
  const db = createD1Db(env.DB);
  const password = Password.orThrow('securepassword1234');

  const setup = async () => {
    const userId = UserId.generate();
    const hashed = await Password.hashPassword(fakeDerive)(password);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(userId, username) VALUES (?, ?)').bind(userId, `user-${userId}`),
      env.DB.prepare(
        'INSERT INTO user_passwords(userId, algorithm, parallelism, tagLength, memory, passes, nonceHex, tagHex) VALUES (?,?,?,?,?,?,?,?)',
      ).bind(
        userId,
        hashed.algorithm,
        hashed.parallelism,
        hashed.tagLength,
        hashed.memory,
        hashed.passes,
        hashed.nonceHex,
        hashed.tagHex,
      ),
    ]);
    const passkeyCredentialResolverByCredentialId = createD1PasskeyCredentialResolverByCredentialId(db);
    const passkeyCredentialsResolverByUserId = createD1PasskeyCredentialsResolverByUserId(db);
    const webAuthnChallengeIssuedStore = createD1WebAuthnChallengeIssuedStore(db);
    const webAuthnChallengeConsumer = createD1WebAuthnChallengeConsumer(db);
    return {
      userId,
      passkeyCredentialResolverByCredentialId,
      startRegistration: StartPasskeyRegistrationUseCase.create({
        userResolver: createD1UserResolver(db),
        userPasswordResolver: createD1UserPasswordResolver(db),
        passkeyCredentialsResolverByUserId,
        webAuthnChallengeIssuedStore,
        argon2idDerive: fakeDerive,
        rpId: rpID,
      }),
      finishRegistration: FinishPasskeyRegistrationUseCase.create({
        webAuthnChallengeConsumer,
        passkeyCredentialResolverByCredentialId,
        passkeyRegisteredStore: createD1PasskeyRegisteredStore(db),
        rpId: rpID,
        origin,
      }),
      startAuthentication: StartPasskeyAuthenticationUseCase.create({ webAuthnChallengeIssuedStore, rpId: rpID }),
      finishAuthentication: FinishPasskeyAuthenticationUseCase.create({
        webAuthnChallengeConsumer,
        passkeyCredentialResolverByCredentialId,
        passkeyUsedStore: createD1PasskeyUsedStore(db),
        sessionStartedStore: createD1SessionStartedStore(db),
        rpId: rpID,
        origin,
      }),
      list: ListPasskeysUseCase.create({ passkeyCredentialsResolverByUserId }),
      remove: DeletePasskeyUseCase.create({
        passkeyCredentialResolverByCredentialId,
        passkeyDeletedStore: createD1PasskeyDeletedStore(db),
      }),
    };
  };

  const challengeCount = async (challengeId: string) =>
    (await env.DB.prepare('SELECT COUNT(*) AS count FROM webauthn_challenges WHERE challengeId = ?')
      .bind(challengeId).first<{ count: number }>())!.count;

  it('登録、ログイン、challenge の再利用の失敗、削除を実 D1 で通す', async () => {
    const h = await setup();
    const authenticator = await createSoftwareAuthenticator();

    const registrationStarted = await h.startRegistration.run({ userId: h.userId, password });
    if (!registrationStarted.ok) throw new Error(registrationStarted.err.type);
    const registration = registrationStarted.val;
    expect(await challengeCount(registration.challengeId)).toBe(1);

    const registered = await h.finishRegistration.run({
      userId: h.userId,
      challengeId: registration.challengeId,
      response: await authenticator.createRegistrationResponse({
        challenge: registration.options.challenge,
        origin,
        rpId: rpID,
      }),
      name: 'テスト用の端末',
    });
    expect(registered.ok).toBe(true);
    expect(await challengeCount(registration.challengeId)).toBe(0);
    const credentialId = PasskeyCredentialId.orThrow(authenticator.credentialId);
    const stored = await h.passkeyCredentialResolverByCredentialId.resolve(credentialId);
    expect(stored.ok && stored.val).toMatchObject({
      credentialId,
      userId: h.userId,
      counter: 0,
      name: 'テスト用の端末',
      transports: ['internal'],
      deviceType: 'singleDevice',
      backedUp: false,
      lastUsedAt: null,
    });

    const authenticationStarted = await h.startAuthentication.run({});
    if (!authenticationStarted.ok) throw new Error('unexpected');
    const authentication = authenticationStarted.val;
    const authenticationResponse = await authenticator.createAuthenticationResponse({
      challenge: authentication.options.challenge,
      origin,
      rpId: rpID,
      counter: 4,
    });
    const signedIn = await h.finishAuthentication.run({
      challengeId: authentication.challengeId,
      response: authenticationResponse,
    });
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) return;
    const session = await createD1SessionResolver(db).resolve(signedIn.val.sessionId);
    expect(session.ok && session.val?.userId).toBe(h.userId);
    const used = await h.passkeyCredentialResolverByCredentialId.resolve(credentialId);
    expect(used.ok && used.val).toMatchObject({ counter: 4 });
    expect(used.ok && used.val?.lastUsedAt).not.toBeNull();

    const reused = await h.finishAuthentication.run({
      challengeId: authentication.challengeId,
      response: authenticationResponse,
    });
    expect(reused.ok).toBe(false);
    if (!reused.ok) expect(reused.err.type).toBe('WebAuthnChallengeInvalidError');

    const events = await env.DB.prepare(
      'SELECT eventName FROM domain_events WHERE aggregateName IN (?, ?) ORDER BY occurredAt',
    ).bind('passkeyCredential', 'webAuthnChallenge').all<{ eventName: string }>();
    expect(events.results.map(({ eventName }) => eventName)).toEqual(expect.arrayContaining([
      'passkeyCredential.registered',
      'passkeyCredential.used',
      'webAuthnChallenge.issued',
      'webAuthnChallenge.consumed',
    ]));

    const listed = await h.list.run({ userId: h.userId });
    expect(listed.ok && listed.val.credentials.map((credential) => credential.credentialId)).toEqual([credentialId]);
    const foreign = await h.remove.run({ userId: UserId.generate(), credentialId });
    expect(foreign.ok).toBe(false);
    const removed = await h.remove.run({ userId: h.userId, credentialId });
    expect(removed.ok).toBe(true);
    const afterRemoval = await h.passkeyCredentialResolverByCredentialId.resolve(credentialId);
    expect(afterRemoval.ok && afterRemoval.val).toBeUndefined();
  });

  it('期限切れの challenge は、次の発行で同じ batch で消える', async () => {
    const h = await setup();
    const first = await h.startAuthentication.run({});
    if (!first.ok) throw new Error('unexpected');
    await env.DB.prepare('UPDATE webauthn_challenges SET expires = 1 WHERE challengeId = ?')
      .bind(first.val.challengeId).run();

    const second = await h.startAuthentication.run({});
    if (!second.ok) throw new Error('unexpected');

    expect(await challengeCount(first.val.challengeId)).toBe(0);
    expect(await challengeCount(second.val.challengeId)).toBe(1);
  });

  it('消費済みの challenge は 2 回目に見つからない', async () => {
    const h = await setup();
    const issued = await h.startAuthentication.run({});
    if (!issued.ok) throw new Error('unexpected');
    const consumer = createD1WebAuthnChallengeConsumer(db);

    const first = await consumer.consume(issued.val.challengeId, Date.now() as never);
    const second = await consumer.consume(issued.val.challengeId, Date.now() as never);

    expect(first.ok && first.val?.challenge).toBe(issued.val.options.challenge);
    expect(second.ok && second.val).toBeUndefined();
  });
});
