import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import z from 'zod/v4';

import { Password } from '../../domain/password/password.ts';
import { Username } from '../../domain/user/username.ts';
import { Federation } from '../../federation.ts';
import { Layout } from '../../layout.tsx';
import { SignInUseCase } from '../../useCase/signIn.ts';
import { PgSessionStartedStore } from '../pg/session/sessionStartedStore.ts';
import { PgUserResolverByUsername } from '../pg/user/userResolverByUsername.ts';
import { PgUserPasswordResolver } from '../pg/userPassword/userPasswordResolver.ts';

const app = new Hono();
app.get('/', async (c) => {
  return c.html(
    <Layout>
      <section class='bg-white dark:bg-gray-800 rounded-3xl shadow-puffy dark:shadow-puffy-dark p-8'>
        <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>Sign in</h1>
        <form method='post' action='/sign-in' class='space-y-4'>
          <div>
            <input
              type='text'
              name='username'
              placeholder='Username'
              required
              class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400'
            />
          </div>
          <div>
            <input
              type='password'
              name='password'
              placeholder='Password'
              required
              minlength={16}
              maxlength={255}
              class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400'
            />
          </div>
          <button
            type='submit'
            class='w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-2xl transition-colors'
          >
            Sign in
          </button>
        </form>
        <p class='mt-6 text-sm text-gray-500 dark:text-gray-400 text-center'>
          Don't have an account?{' '}
          <a
            href='/sign-up'
            class='text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white font-medium'
          >
            Sign up
          </a>
        </p>
      </section>
    </Layout>,
  );
});
app.post(
  '/',
  sValidator(
    'form',
    z.object({
      username: Username.zodType,
      password: Password.zodType,
    }),
  ),
  async (c) => {
    const form = c.req.valid('form');
    const logger = getLogger('microblog:sign-in');
    logger.info('Sign in attempt', { username: form.username });

    const useCase = SignInUseCase.create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      userPasswordResolver: PgUserPasswordResolver.getInstance(),
      sessionStartedStore: PgSessionStartedStore.getInstance(),
    });
    const onOk = (v: { sessionId: string }) => {
      logger.info('Sign in successful', { username: form.username });
      setCookie(c, 'sessionId', v.sessionId, {
        httpOnly: true,
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
        sameSite: 'lax',
        secure: true,
      });
      return c.redirect('/');
    };
    const onErr = (e: { type: 'UsernameOrPasswordInvalid' }) => {
      logger.warn('Sign in failed', { error: e });
      return c.html(
        <Layout>
          <section class='bg-white dark:bg-gray-800 rounded-3xl shadow-puffy dark:shadow-puffy-dark p-8'>
            <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>Sign in</h1>
            <div class='mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl'>
              <p class='text-red-600 dark:text-red-400 text-sm'>
                Sign in failed: Invalid username or password
              </p>
            </div>
            <form method='post' action='/sign-in' class='space-y-4'>
              <div>
                <input
                  type='text'
                  name='username'
                  placeholder='Username'
                  required
                  class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400'
                />
              </div>
              <div>
                <input
                  type='password'
                  name='password'
                  placeholder='Password'
                  required
                  minlength={16}
                  maxlength={255}
                  class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400'
                />
              </div>
              <button
                type='submit'
                class='w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-2xl transition-colors'
              >
                Sign in
              </button>
            </form>
            <p class='mt-6 text-sm text-gray-500 dark:text-gray-400 text-center'>
              Don't have an account?{' '}
              <a
                href='/sign-up'
                class='text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white font-medium'
              >
                Sign up
              </a>
            </p>
          </section>
        </Layout>,
      );
    };
    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);
    return RA.flow(
      useCase.run({ username: form.username, password: form.password, ctx }),
      RA.match({
        ok: onOk,
        err: onErr,
      }),
    );
  },
);

export { app as SignInRouter };
