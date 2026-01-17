import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import { Hono } from 'hono';
import z from 'zod/v4';

import { Password } from '../../domain/password/password.ts';
import type { UnacceptableUsernameError, User, UsernameAlreadyTakenError } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';
import { Federation } from '../../federation.ts';
import { Layout } from '../../layout.tsx';
import { SignUpUseCase } from '../../useCase/signUp.ts';
import { PgLocalActorCreatedStore } from '../pg/actor/localActorCreatedStore.ts';
import { PgUserCreatedStore } from '../pg/user/userCreatedStore.ts';
import { PgUserResolverByUsername } from '../pg/user/userResolverByUsername.ts';
import { PgUserPasswordSetStore } from '../pg/userPassword/userPasswordSetStore.ts';

const app = new Hono();

app.get('/', async (c) => {
  return c.html(
    <Layout>
      <section class='bg-white dark:bg-gray-800 rounded-3xl shadow-puffy dark:shadow-puffy-dark p-8'>
        <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>Sign up</h1>
        <form method='post' action='/sign-up' class='space-y-4'>
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
              placeholder='Password (min 16 characters)'
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
            Sign up
          </button>
        </form>
        <p class='mt-6 text-sm text-gray-500 dark:text-gray-400 text-center'>
          Already have an account?{' '}
          <a
            href='/sign-in'
            class='text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white font-medium'
          >
            Sign in
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
    const logger = getLogger('microblog:sign-up');
    logger.info('Sign up attempt', { username: form.username });

    const useCase = SignUpUseCase.create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      userCreatedStore: PgUserCreatedStore.getInstance(),
      localActorCreatedStore: PgLocalActorCreatedStore.getInstance(),
      userPasswordSetStore: PgUserPasswordSetStore.getInstance(),
    });

    const onOk = (v: { user: User }) => {
      logger.info('Sign up successful', { username: v.user.username });
      return c.html(
        <Layout>
          <section class='bg-white dark:bg-gray-800 rounded-3xl shadow-puffy dark:shadow-puffy-dark p-8'>
            <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>Sign up</h1>
            <div class='mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl'>
              <p class='text-green-600 dark:text-green-400 text-sm'>
                Sign up successful for username: {String(v.user.username)}
              </p>
            </div>
            <a
              href='/sign-in'
              class='block w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-2xl transition-colors text-center'
            >
              Go to Sign in
            </a>
          </section>
        </Layout>,
      );
    };

    const onErr = (
      e: UsernameAlreadyTakenError | UnacceptableUsernameError,
    ) => {
      logger.warn('Sign up failed', { error: e });
      return c.html(
        <Layout>
          <section class='bg-white dark:bg-gray-800 rounded-3xl shadow-puffy dark:shadow-puffy-dark p-8'>
            <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>Sign up</h1>
            <div class='mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl'>
              <p class='text-red-600 dark:text-red-400 text-sm'>
                Sign up failed: {e.message}
              </p>
            </div>
            <form method='post' action='/sign-up' class='space-y-4'>
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
                  placeholder='Password (min 16 characters)'
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
                Sign up
              </button>
            </form>
            <p class='mt-6 text-sm text-gray-500 dark:text-gray-400 text-center'>
              Already have an account?{' '}
              <a
                href='/sign-in'
                class='text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white font-medium'
              >
                Sign in
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

export { app as SignUpRouter };
