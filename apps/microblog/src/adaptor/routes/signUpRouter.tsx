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
      <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 blob-bg clay-hover-lift'>
        <h1 class='text-2xl font-bold text-terracotta-dark dark:text-terracotta-light mb-6'>Sign up</h1>
        <form method='post' action='/sign-up' class='space-y-4'>
          <div class='space-y-2'>
            <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Username</label>
            <input
              type='text'
              name='username'
              placeholder='Choose a username'
              required
              class='w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all'
            />
          </div>
          <div class='space-y-2'>
            <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Password</label>
            <input
              type='password'
              name='password'
              placeholder='Min 16 characters'
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
            Sign up
          </button>
        </form>
        <p class='mt-6 text-sm text-charcoal-light dark:text-gray-400 text-center'>
          Already have an account?{' '}
          <a
            href='/sign-in'
            class='text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta font-medium transition-colors'
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
          <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 blob-bg clay-hover-lift'>
            <h1 class='text-2xl font-bold text-terracotta-dark dark:text-terracotta-light mb-6'>Sign up</h1>
            <div class='mb-6 p-4 bg-cream dark:bg-gray-700 rounded-clay shadow-clay-sm border-l-4 border-sage flex items-start gap-3'>
              <div class='w-6 h-6 bg-sage rounded-full flex items-center justify-center flex-shrink-0 shadow-clay-sm'>
                <span class='text-white text-xs font-bold'>&#10003;</span>
              </div>
              <div>
                <p class='text-sm font-semibold text-sage-dark dark:text-sage'>Success</p>
                <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                  Sign up successful for username: {String(v.user.username)}
                </p>
              </div>
            </div>
            <a
              href='/sign-in'
              class='block w-full px-4 py-3 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all text-center active:scale-[0.98] active:translate-y-px'
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
          <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 blob-bg clay-hover-lift'>
            <h1 class='text-2xl font-bold text-terracotta-dark dark:text-terracotta-light mb-6'>Sign up</h1>
            <div class='mb-4 p-4 bg-cream dark:bg-gray-700 rounded-clay shadow-clay-sm border-l-4 border-terracotta flex items-start gap-3'>
              <div class='w-6 h-6 bg-terracotta rounded-full flex items-center justify-center flex-shrink-0 shadow-clay-sm'>
                <span class='text-white text-xs font-bold'>!</span>
              </div>
              <div>
                <p class='text-sm font-semibold text-terracotta-dark dark:text-terracotta-light'>Error</p>
                <p class='text-charcoal-light dark:text-gray-400 text-sm'>
                  Sign up failed: {e.message}
                </p>
              </div>
            </div>
            <form method='post' action='/sign-up' class='space-y-4'>
              <div class='space-y-2'>
                <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Username</label>
                <input
                  type='text'
                  name='username'
                  placeholder='Choose a username'
                  required
                  class='w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all'
                />
              </div>
              <div class='space-y-2'>
                <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Password</label>
                <input
                  type='password'
                  name='password'
                  placeholder='Min 16 characters'
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
                Sign up
              </button>
            </form>
            <p class='mt-6 text-sm text-charcoal-light dark:text-gray-400 text-center'>
              Already have an account?{' '}
              <a
                href='/sign-in'
                class='text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta font-medium transition-colors'
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
