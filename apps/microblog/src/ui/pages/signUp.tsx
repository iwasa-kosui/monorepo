import { useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

const SignUpPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Sign up successful for username: ${data.username}`);
        setUsername('');
        setPassword('');
      } else {
        setError(data.error || 'Sign up failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 blob-bg clay-hover-lift'>
      <h1 class='text-2xl font-bold text-terracotta-dark dark:text-terracotta-light mb-6'>Sign up</h1>

      {success && (
        <div class='mb-6 p-4 bg-cream dark:bg-gray-700 rounded-clay shadow-clay-sm border-l-4 border-sage flex items-start gap-3'>
          <div class='w-6 h-6 bg-sage rounded-full flex items-center justify-center flex-shrink-0 shadow-clay-sm'>
            <span class='text-white text-xs font-bold'>&#10003;</span>
          </div>
          <div>
            <p class='text-sm font-semibold text-sage-dark dark:text-sage'>Success</p>
            <p class='text-charcoal-light dark:text-gray-400 text-sm'>
              {success}
            </p>
          </div>
        </div>
      )}

      {success
        ? (
          <a
            href='/sign-in'
            class='block w-full px-4 py-3 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all text-center active:scale-[0.98] active:translate-y-px'
          >
            Go to Sign in
          </a>
        )
        : (
          <>
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

            <form onSubmit={handleSubmit} class='space-y-4'>
              <div class='space-y-2'>
                <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Username</label>
                <input
                  type='text'
                  value={username}
                  onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
                  placeholder='Choose a username'
                  required
                  class='w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all'
                />
              </div>
              <div class='space-y-2'>
                <label class='text-sm font-medium text-charcoal dark:text-gray-300'>Password</label>
                <input
                  type='password'
                  value={password}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                  placeholder='Min 16 characters'
                  required
                  minlength={16}
                  maxlength={255}
                  class='w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all'
                />
              </div>
              <button
                type='submit'
                disabled={isSubmitting}
                class='w-full px-4 py-3 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all active:scale-[0.98] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isSubmitting ? 'Signing up...' : 'Sign up'}
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
          </>
        )}
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<SignUpPage />, root);
}
