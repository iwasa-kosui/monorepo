import type { FC } from 'hono/jsx';

import type { FederatedTimelineItemWithPost } from '../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { Relay } from '../../domain/relay/relay.ts';
import { Layout } from '../../layout.tsx';
import { PostView } from '../components/PostView.tsx';

type Props = Readonly<{
  items: ReadonlyArray<FederatedTimelineItemWithPost>;
  relays: ReadonlyArray<Relay>;
  isLoggedIn: boolean;
}>;

export const FederatedTimelinePage: FC<Props> = ({ items, relays, isLoggedIn }) => (
  <Layout>
    <section class='space-y-6 py-2'>
      <div class='flex items-center justify-between mb-2'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white'>
          Federated Timeline
        </h1>
        <div class='flex items-center gap-4'>
          <a
            href='/'
            class='text-sm text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
          >
            Home
          </a>
          {isLoggedIn
            ? (
              <a
                href='#add-relay'
                class='text-sm text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta transition-colors'
              >
                Add Relay
              </a>
            )
            : (
              <a
                href='/sign-in'
                class='text-sm text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta transition-colors'
              >
                Sign in
              </a>
            )}
        </div>
      </div>

      {/* Connected Relays */}
      {isLoggedIn && relays.length > 0 && (
        <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4 mb-4'>
          <h2 class='text-sm font-semibold text-charcoal dark:text-white mb-2'>
            Connected Relays ({relays.length})
          </h2>
          <div class='flex flex-wrap gap-2'>
            {relays.map((relay) => (
              <span
                key={relay.relayId}
                class={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
                  relay.status === 'accepted'
                    ? 'bg-sage/20 text-sage-dark dark:bg-sage-dark/20 dark:text-sage'
                    : 'bg-sand/20 text-sand-dark dark:bg-sand-dark/20 dark:text-sand'
                }`}
              >
                <span
                  class={`w-2 h-2 rounded-full ${relay.status === 'accepted' ? 'bg-sage' : 'bg-sand animate-pulse'}`}
                />
                {new URL(relay.actorUri).host}
                <span class='text-[10px] opacity-70'>
                  ({relay.status === 'accepted' ? 'active' : 'pending'})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p class='text-sm text-charcoal-light dark:text-gray-400 mb-4'>
        Posts from connected relay servers
      </p>

      {items.length > 0
        ? (
          items.map((item) => <PostView key={item.federatedTimelineItemId} post={item.post} />)
        )
        : (
          <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 text-center'>
            <p class='text-charcoal-light dark:text-gray-400'>
              No posts from relay servers yet
            </p>
            {isLoggedIn
              ? (
                <p class='text-sm text-charcoal-light dark:text-gray-500 mt-2'>
                  <a href='#add-relay' class='text-terracotta hover:underline'>
                    Add a relay server
                  </a>{' '}
                  to see posts from other instances
                </p>
              )
              : (
                <p class='text-sm text-charcoal-light dark:text-gray-500 mt-2'>
                  Sign in to add relay servers
                </p>
              )}
          </div>
        )}

      {/* Add Relay Modal */}
      {isLoggedIn && (
        <div
          id='add-relay'
          class='fixed inset-0 bg-charcoal/50 backdrop-blur-sm flex items-center justify-center z-50 opacity-0 pointer-events-none target:opacity-100 target:pointer-events-auto transition-opacity'
        >
          <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md mx-4'>
            <div class='flex items-center justify-between mb-4'>
              <h2 class='text-lg font-semibold text-charcoal dark:text-white'>
                Add Relay Server
              </h2>
              <a
                href='#'
                class='p-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 transition-colors rounded-xl hover:bg-sand-light dark:hover:bg-gray-700'
              >
                <svg class='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                  <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
                </svg>
              </a>
            </div>

            <form id='add-relay-form' class='space-y-4'>
              <div>
                <label class='block text-sm font-medium text-charcoal dark:text-gray-300 mb-1'>
                  Relay Actor URI
                </label>
                <input
                  type='url'
                  name='actorUri'
                  placeholder='https://relay.example.com/actor'
                  required
                  class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset transition-all'
                />
                <p class='mt-1 text-xs text-charcoal-light dark:text-gray-500'>
                  Enter the ActivityPub actor URI of the relay server
                </p>
              </div>

              <div
                id='add-relay-error'
                class='hidden p-3 rounded-clay bg-terracotta/10 text-terracotta-dark dark:text-terracotta-light text-sm'
              >
              </div>

              <div
                id='add-relay-success'
                class='hidden p-3 rounded-clay bg-sage/10 text-sage-dark dark:text-sage text-sm'
              >
                Relay subscription request sent! Waiting for approval...
              </div>

              <div class='flex gap-2 justify-end'>
                <a
                  href='#'
                  class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
                >
                  Cancel
                </a>
                <button
                  type='submit'
                  id='add-relay-submit'
                  class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  Subscribe
                </button>
              </div>
            </form>

            <script
              dangerouslySetInnerHTML={{
                __html: `
              document.getElementById('add-relay-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const form = e.target;
                const submitBtn = document.getElementById('add-relay-submit');
                const errorDiv = document.getElementById('add-relay-error');
                const successDiv = document.getElementById('add-relay-success');
                const actorUri = form.actorUri.value;

                submitBtn.disabled = true;
                submitBtn.textContent = 'Subscribing...';
                errorDiv.classList.add('hidden');
                successDiv.classList.add('hidden');

                try {
                  const response = await fetch('/api/v1/relay', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ actorUri }),
                  });
                  const data = await response.json();

                  if (response.ok) {
                    successDiv.classList.remove('hidden');
                    form.reset();
                    setTimeout(() => {
                      window.location.reload();
                    }, 2000);
                  } else {
                    errorDiv.textContent = data.error || 'Failed to subscribe to relay';
                    errorDiv.classList.remove('hidden');
                  }
                } catch (err) {
                  errorDiv.textContent = 'Network error. Please try again.';
                  errorDiv.classList.remove('hidden');
                } finally {
                  submitBtn.disabled = false;
                  submitBtn.textContent = 'Subscribe';
                }
              });
            `,
              }}
            />
          </div>
        </div>
      )}
    </section>
  </Layout>
);
