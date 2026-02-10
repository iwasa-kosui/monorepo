import { useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

const FollowPage = () => {
  const params = new URLSearchParams(window.location.search);
  const initialUri = params.get('uri') ?? '';

  const [handle, setHandle] = useState(initialUri);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });

      if (response.ok) {
        setSuccess(true);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to follow');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Follow</h1>
        <div class='mb-4 p-4 bg-sage/10 dark:bg-sage-dark/20 rounded-clay'>
          <p class='text-sage-dark dark:text-sage text-sm flex items-center gap-2'>
            <svg class='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M5 13l4 4L19 7' />
            </svg>
            Successfully sent a follow request
          </p>
        </div>
        <a
          href='/'
          class='block w-full px-4 py-3 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all text-center active:scale-[0.98] active:translate-y-px'
        >
          Back to Home
        </a>
      </section>
    );
  }

  return (
    <section class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Follow</h1>

      {error && (
        <div class='mb-4 p-4 bg-terracotta/10 dark:bg-terracotta-dark/20 rounded-clay'>
          <p class='text-terracotta-dark dark:text-terracotta-light text-sm'>
            {error}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} class='space-y-4'>
        <div>
          <input
            type='text'
            value={handle}
            onInput={(e) => setHandle((e.target as HTMLInputElement).value)}
            placeholder='Handle to follow (e.g., @user@example.com)'
            required
            class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset transition-all'
          />
        </div>
        <button
          type='submit'
          disabled={isSubmitting}
          class='w-full px-4 py-3 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all active:scale-[0.98] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {isSubmitting ? 'Following...' : 'Follow'}
        </button>
      </form>
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<FollowPage />, root);
}
