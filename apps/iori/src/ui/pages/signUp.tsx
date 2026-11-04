import { render } from 'hono/jsx/dom';

const FALLBACK_ERROR_MESSAGE = '処理に失敗しました。もう一度お試しください';

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_input: '入力内容が正しくありません。ユーザー名とパスワード（16文字以上）を確認してください',
  username_unacceptable: 'このユーザー名は使用できません',
  username_taken: 'このユーザー名はすでに使われています',
  failed: FALLBACK_ERROR_MESSAGE,
};

const errorMessageFor = (code: string | null): string | undefined => {
  if (code === null) return undefined;
  return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : FALLBACK_ERROR_MESSAGE;
};

const SignUpPage = () => {
  const error = errorMessageFor(new URLSearchParams(window.location.search).get('error'));

  return (
    <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 blob-bg clay-hover-lift'>
      <h1 class='text-2xl font-bold text-terracotta-dark dark:text-terracotta-light mb-6'>Sign up</h1>

      {error && (
        <div class='mb-4 p-4 bg-cream dark:bg-gray-700 rounded-clay shadow-clay-sm border-l-4 border-terracotta flex items-start gap-3'>
          <div class='w-6 h-6 bg-terracotta rounded-full flex items-center justify-center flex-shrink-0 shadow-clay-sm'>
            <span class='text-white text-xs font-bold'>!</span>
          </div>
          <div>
            <p class='text-sm font-semibold text-terracotta-dark dark:text-terracotta-light'>Error</p>
            <p class='text-charcoal-light dark:text-gray-400 text-sm'>
              {error}
            </p>
          </div>
        </div>
      )}

      <form method='post' action='/auth/sign-up' class='space-y-4'>
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
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<SignUpPage />, root);
}
