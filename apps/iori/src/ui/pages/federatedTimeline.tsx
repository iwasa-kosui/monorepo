import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import { PostView } from '../components/PostView.tsx';

type FederatedTimelineItem = {
  federatedTimelineItemId: string;
  post: {
    postId: string;
    content: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type Relay = {
  relayId: string;
  actorUri: string;
  status: string;
};

const FederatedTimelinePage = () => {
  const [items, setItems] = useState<FederatedTimelineItem[]>([]);
  const [relays, setRelays] = useState<Relay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showRelayModal, setShowRelayModal] = useState(false);
  const [relayUri, setRelayUri] = useState('');
  const [relayError, setRelayError] = useState('');
  const [relaySuccess, setRelaySuccess] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const timelineResponse = await fetch('/api/v1/federated');
        if (timelineResponse.ok) {
          const timelineData = await timelineResponse.json();
          setItems(timelineData.items);
          setIsLoggedIn(true);

          const relaysResponse = await fetch('/api/v1/relays');
          if (relaysResponse.ok) {
            const relaysData = await relaysResponse.json();
            setRelays(relaysData.relays);
          }
        } else {
          setIsLoggedIn(false);
        }
      } catch {
        // Network error
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();

    const handleHashChange = () => {
      if (window.location.hash === '#add-relay') {
        setShowRelayModal(true);
      } else {
        setShowRelayModal(false);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleRelaySubmit = async (e: Event) => {
    e.preventDefault();
    setRelayError('');
    setRelaySuccess(false);
    setIsSubscribing(true);

    try {
      const response = await fetch('/api/v1/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorUri: relayUri }),
      });
      const data = await response.json();

      if (response.ok) {
        setRelaySuccess(true);
        setRelayUri('');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setRelayError(data.error || 'Failed to subscribe to relay');
      }
    } catch {
      setRelayError('Network error. Please try again.');
    } finally {
      setIsSubscribing(false);
    }
  };

  if (isLoading) {
    return (
      <section class='space-y-6 py-2'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white'>Federated Timeline</h1>
        <div class='flex items-center justify-center py-8'>
          <svg class='animate-spin h-8 w-8 text-terracotta' viewBox='0 0 24 24'>
            <circle class='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' stroke-width='4' fill='none' />
            <path
              class='opacity-75'
              fill='currentColor'
              d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
            />
          </svg>
        </div>
      </section>
    );
  }

  return (
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
              <button
                type='button'
                onClick={() => {
                  setShowRelayModal(true);
                  window.location.hash = 'add-relay';
                }}
                class='text-sm text-terracotta hover:text-terracotta-dark dark:text-terracotta-light dark:hover:text-terracotta transition-colors'
              >
                Add Relay
              </button>
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
          items.map((item) => <PostView key={item.federatedTimelineItemId} post={item.post as never} />)
        )
        : (
          <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 text-center'>
            <p class='text-charcoal-light dark:text-gray-400'>
              No posts from relay servers yet
            </p>
            {isLoggedIn
              ? (
                <p class='text-sm text-charcoal-light dark:text-gray-500 mt-2'>
                  <button
                    type='button'
                    onClick={() => {
                      setShowRelayModal(true);
                      window.location.hash = 'add-relay';
                    }}
                    class='text-terracotta hover:underline'
                  >
                    Add a relay server
                  </button>{' '}
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
      {isLoggedIn && showRelayModal && (
        <div
          class='fixed inset-0 bg-charcoal/50 backdrop-blur-sm flex items-center justify-center z-50'
          onClick={() => {
            setShowRelayModal(false);
            window.location.hash = '';
          }}
        >
          <div
            class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md mx-4'
            onClick={(e) => e.stopPropagation()}
          >
            <div class='flex items-center justify-between mb-4'>
              <h2 class='text-lg font-semibold text-charcoal dark:text-white'>
                Add Relay Server
              </h2>
              <button
                type='button'
                onClick={() => {
                  setShowRelayModal(false);
                  window.location.hash = '';
                }}
                class='p-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 transition-colors rounded-xl hover:bg-sand-light dark:hover:bg-gray-700'
              >
                <svg class='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                  <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
                </svg>
              </button>
            </div>

            <form onSubmit={handleRelaySubmit} class='space-y-4'>
              <div>
                <label class='block text-sm font-medium text-charcoal dark:text-gray-300 mb-1'>
                  Relay Actor URI
                </label>
                <input
                  type='url'
                  value={relayUri}
                  onInput={(e) => setRelayUri((e.target as HTMLInputElement).value)}
                  placeholder='https://relay.example.com/actor'
                  required
                  class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset transition-all'
                />
                <p class='mt-1 text-xs text-charcoal-light dark:text-gray-500'>
                  Enter the ActivityPub actor URI of the relay server
                </p>
              </div>

              {relayError && (
                <div class='p-3 rounded-clay bg-terracotta/10 text-terracotta-dark dark:text-terracotta-light text-sm'>
                  {relayError}
                </div>
              )}

              {relaySuccess && (
                <div class='p-3 rounded-clay bg-sage/10 text-sage-dark dark:text-sage text-sm'>
                  Relay subscription request sent! Waiting for approval...
                </div>
              )}

              <div class='flex gap-2 justify-end'>
                <button
                  type='button'
                  onClick={() => {
                    setShowRelayModal(false);
                    window.location.hash = '';
                  }}
                  class='px-4 py-2 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={isSubscribing}
                  class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {isSubscribing ? 'Subscribing...' : 'Subscribe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<FederatedTimelinePage />, root);
}
