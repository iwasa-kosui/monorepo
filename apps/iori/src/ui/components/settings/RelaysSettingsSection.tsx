import { useCallback, useEffect, useState } from 'hono/jsx';

import { addRelay, fetchRelaysOrThrow, type Relay, relayHost } from '../../api/relays.ts';
import { SettingsSection } from './SettingsSection.tsx';

type Props = Readonly<{
  relays: readonly Relay[] | undefined;
  loadFailed: boolean;
  relayUri: string;
  isSubscribing: boolean;
  errorText: string;
  isRequested: boolean;
  onUriInput: (value: string) => void;
  onSubmit: (e: Event) => void;
}>;

export const RelaysSettingsView = (
  { relays, loadFailed, relayUri, isSubscribing, errorText, isRequested, onUriInput, onSubmit }: Props,
) => (
  <SettingsSection id='relays' title='リレー'>
    <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5'>
      {relays === undefined
        ? (
          <p class='text-sm text-charcoal-light dark:text-gray-400'>
            {loadFailed ? 'リレーを読み込めませんでした' : '読み込み中...'}
          </p>
        )
        : relays.length === 0
        ? <p class='text-sm text-charcoal-light dark:text-gray-400'>接続しているリレーはありません</p>
        : (
          <ul class='flex flex-wrap gap-2'>
            {relays.map((relay) => (
              <li
                key={relay.relayId}
                class={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
                  relay.status === 'accepted'
                    ? 'bg-sage/20 text-sage-dark dark:bg-sage-dark/20 dark:text-sage'
                    : 'bg-sand/20 text-sand-dark dark:bg-sand-dark/20 dark:text-sand'
                }`}
              >
                {relayHost(relay)}
                <span class='text-[10px] opacity-70'>
                  ({relay.status === 'accepted' ? '接続済み' : '承認待ち'})
                </span>
              </li>
            ))}
          </ul>
        )}
      <form onSubmit={onSubmit} class='mt-4 flex gap-2'>
        <input
          type='url'
          value={relayUri}
          onInput={(e: Event) => onUriInput((e.target as HTMLInputElement).value)}
          placeholder='https://relay.example.com/actor'
          aria-label='リレーの Actor URI'
          required
          class='flex-1 min-w-0 px-4 py-2 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset'
        />
        <button
          type='submit'
          disabled={isSubscribing}
          class='flex-shrink-0 px-4 py-2 bg-terracotta hover:bg-terracotta-dark disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          {isSubscribing ? '追加中...' : '追加'}
        </button>
      </form>
      {errorText && <p role='alert' class='mt-2 text-sm text-terracotta-dark dark:text-terracotta-light'>{errorText}
      </p>}
      {isRequested && (
        <p role='status' class='mt-2 text-sm text-sage-dark dark:text-sage'>
          購読の申請を送りました。リレーの承認を待っています。
        </p>
      )}
    </div>
  </SettingsSection>
);

export const RelaysSettingsSection = () => {
  const [relays, setRelays] = useState<readonly Relay[] | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [relayUri, setRelayUri] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isRequested, setIsRequested] = useState(false);

  const load = useCallback(async () => {
    try {
      setRelays(await fetchRelaysOrThrow());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (isSubscribing) return;
    setErrorText('');
    setIsRequested(false);
    setIsSubscribing(true);
    const outcome = await addRelay(relayUri);
    setIsSubscribing(false);
    if (outcome.ok) {
      setIsRequested(true);
      setRelayUri('');
      await load();
    } else {
      setErrorText(outcome.message);
    }
  };

  return (
    <RelaysSettingsView
      relays={relays}
      loadFailed={loadFailed}
      relayUri={relayUri}
      isSubscribing={isSubscribing}
      errorText={errorText}
      isRequested={isRequested}
      onUriInput={setRelayUri}
      onSubmit={handleSubmit}
    />
  );
};
