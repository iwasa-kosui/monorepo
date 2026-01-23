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
      <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 blob-bg clay-hover-lift'>
        <h1 class='text-2xl font-bold text-terracotta-dark dark:text-terracotta-light mb-6'>Sign in</h1>
        <form method='post' action='/sign-in' class='space-y-4'>
          <div class='space-y-2'>
            <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Username</label>
            <input
              type='text'
              name='username'
              placeholder='Enter your username'
              required
              class='w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all'
            />
          </div>
          <div class='space-y-2'>
            <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Password</label>
            <input
              type='password'
              name='password'
              placeholder='Enter your password'
              required
              minlength={16}
              maxlength={255}
              class='w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all'
            />
          </div>
          <button
            type='submit'
            class='w-full px-4 py-3 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all active:scale-[0.98] active:translate-y-px'
          >
            Sign in
          </button>
        </form>
        <p class='mt-6 text-sm text-charcoal-light dark:text-gray-400 text-center'>
          Don't have an account?{' '}
          <a
            href='/sign-up'
            class='text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta font-medium transition-colors'
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
          <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 blob-bg clay-hover-lift'>
            <h1 class='text-2xl font-bold text-terracotta-dark dark:text-terracotta-light mb-6'>Sign in</h1>
            <div class='mb-4 p-4 bg-cream dark:bg-gray-700 rounded-clay shadow-clay-sm border-l-4 border-terracotta flex items-start gap-3'>
              <div class='w-6 h-6 bg-terracotta rounded-full flex items-center justify-center flex-shrink-0 shadow-clay-sm'>
                <span class='text-white text-xs font-bold'>!</span>
              </div>
              <div>
                <p class='text-sm font-semibold text-terracotta-dark dark:text-terracotta-light'>Error</p>
                <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                  Sign in failed: Invalid username or password
                </p>
              </div>
            </div>
            <form method='post' action='/sign-in' class='space-y-4'>
              <div class='space-y-2'>
                <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Username</label>
                <input
                  type='text'
                  name='username'
                  placeholder='Enter your username'
                  required
                  class='w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all'
                />
              </div>
              <div class='space-y-2'>
                <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Password</label>
                <input
                  type='password'
                  name='password'
                  placeholder='Enter your password'
                  required
                  minlength={16}
                  maxlength={255}
                  class='w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all'
                />
              </div>
              <button
                type='submit'
                class='w-full px-4 py-3 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all active:scale-[0.98] active:translate-y-px'
              >
                Sign in
              </button>
            </form>
            <p class='mt-6 text-sm text-charcoal-light dark:text-gray-400 text-center'>
              Don't have an account?{' '}
              <a
                href='/sign-up'
                class='text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta font-medium transition-colors'
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
