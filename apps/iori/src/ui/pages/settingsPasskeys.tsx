import { startRegistration } from '@simplewebauthn/browser';
import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import {
  deletePasskeyCredential,
  fetchPasskeyCredentials,
  fetchRegistrationOptions,
  isPasskeyApiError,
  type PasskeyCredential,
  registerPasskey,
} from '../api/passkeyClient.ts';
import {
  formatPasskeyLastUsedAt,
  formatPasskeyTimestamp,
  PASSKEY_DELETE_FAILED_MESSAGE,
  PASSKEY_LOAD_FAILED_MESSAGE,
  passkeyRegistrationFailureMessage,
} from './passkeyUi.ts';

const INPUT_CLASS =
  'w-full px-4 py-3 rounded-xl bg-cream dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset focus:outline-none focus:border-terracotta focus:shadow-focus-ring dark:focus:shadow-focus-ring-dark transition-all';

const PRIMARY_BUTTON_CLASS =
  'px-4 py-3 bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn hover:shadow-clay-btn-hover transition-all active:scale-[0.98] active:translate-y-px disabled:opacity-60';

const SECONDARY_BUTTON_CLASS =
  'px-3 py-2 text-sm bg-cream dark:bg-gray-700 text-charcoal dark:text-white font-medium rounded-clay border border-warm-gray-dark dark:border-gray-600 shadow-clay-sm transition-all active:scale-[0.98] disabled:opacity-60';

const DANGER_BUTTON_CLASS =
  'px-3 py-2 text-sm bg-terracotta hover:bg-terracotta-dark text-white font-medium rounded-clay shadow-clay-btn transition-all active:scale-[0.98] disabled:opacity-60';

const ErrorNotice = ({ message }: Readonly<{ message: string }>) => (
  <p role='alert' class='text-sm text-terracotta-dark dark:text-terracotta-light'>{message}</p>
);

const redirectToSignIn = () => {
  window.location.href = '/sign-in';
};

const SettingsPasskeysPage = () => {
  const [credentials, setCredentials] = useState<readonly PasskeyCredential[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const loadCredentials = async () => {
    try {
      setCredentials(await fetchPasskeyCredentials());
      setLoadError('');
    } catch (error) {
      if (isPasskeyApiError(error) && error.status === 401) {
        redirectToSignIn();
        return;
      }
      setLoadError(PASSKEY_LOAD_FAILED_MESSAGE);
    }
  };

  useEffect(() => {
    void loadCredentials();
  }, []);

  const handleRegister = async (event: Event) => {
    event.preventDefault();
    if (isRegistering) return;
    setIsRegistering(true);
    setRegisterError('');
    try {
      const optionsJSON = await fetchRegistrationOptions(password);
      const response = await startRegistration({ optionsJSON });
      const trimmedName = name.trim();
      await registerPasskey(response, trimmedName === '' ? undefined : trimmedName);
      setPassword('');
      setName('');
      await loadCredentials();
    } catch (error) {
      setRegisterError(passkeyRegistrationFailureMessage(error) ?? '');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDelete = async (credentialId: string) => {
    setDeletingId(credentialId);
    setDeleteError('');
    try {
      await deletePasskeyCredential(credentialId);
      setPendingDeleteId(null);
      await loadCredentials();
    } catch (error) {
      if (isPasskeyApiError(error) && error.status === 404) {
        setPendingDeleteId(null);
        await loadCredentials();
      } else {
        setDeleteError(PASSKEY_DELETE_FAILED_MESSAGE);
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>パスキー</h1>
      <p class='text-sm text-charcoal-light dark:text-gray-400 mb-6'>
        パスキーを失ったときは、パスワードでログインしてここから削除し、新しいパスキーを登録してください。
      </p>

      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 mb-6'>
        {loadError !== '' && <ErrorNotice message={loadError} />}
        {loadError === '' && credentials === null && <p class='text-charcoal-light dark:text-gray-400'>読み込み中…</p>}
        {credentials !== null && credentials.length === 0 && (
          <p class='text-charcoal-light dark:text-gray-400'>登録済みのパスキーはありません</p>
        )}
        {credentials !== null && credentials.length > 0 && (
          <ul class='divide-y divide-warm-gray-dark dark:divide-gray-600'>
            {credentials.map((credential) => (
              <li
                key={credential.credentialId}
                class='py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4'
              >
                <div class='min-w-0'>
                  <p class='font-medium text-charcoal dark:text-white break-words'>{credential.name}</p>
                  <p class='text-sm text-charcoal-light dark:text-gray-400'>
                    作成日時: {formatPasskeyTimestamp(credential.createdAt)}
                  </p>
                  <p class='text-sm text-charcoal-light dark:text-gray-400'>
                    最終使用日時: {formatPasskeyLastUsedAt(credential.lastUsedAt)}
                  </p>
                </div>
                <div class='flex flex-shrink-0 gap-2'>
                  {pendingDeleteId === credential.credentialId
                    ? (
                      <>
                        <button
                          type='button'
                          class={DANGER_BUTTON_CLASS}
                          disabled={deletingId === credential.credentialId}
                          onClick={() => handleDelete(credential.credentialId)}
                        >
                          本当に削除する
                        </button>
                        <button
                          type='button'
                          class={SECONDARY_BUTTON_CLASS}
                          disabled={deletingId === credential.credentialId}
                          onClick={() => setPendingDeleteId(null)}
                        >
                          キャンセル
                        </button>
                      </>
                    )
                    : (
                      <button
                        type='button'
                        class={SECONDARY_BUTTON_CLASS}
                        onClick={() => {
                          setDeleteError('');
                          setPendingDeleteId(credential.credentialId);
                        }}
                      >
                        削除
                      </button>
                    )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {deleteError !== '' && (
          <div class='mt-4'>
            <ErrorNotice message={deleteError} />
          </div>
        )}
      </div>

      <form
        class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 space-y-4'
        onSubmit={handleRegister}
      >
        <h2 class='text-lg font-bold text-charcoal dark:text-white'>パスキーを追加</h2>
        <div class='space-y-2'>
          <label class='text-sm font-medium text-charcoal dark:text-gray-300' for='passkey-password'>パスワード</label>
          <input
            id='passkey-password'
            type='password'
            name='password'
            autocomplete='current-password'
            required
            maxlength={255}
            value={password}
            onInput={(event: Event) => setPassword((event.target as HTMLInputElement).value)}
            class={INPUT_CLASS}
          />
        </div>
        <div class='space-y-2'>
          <label class='text-sm font-medium text-charcoal dark:text-gray-300' for='passkey-name'>名前（任意）</label>
          <input
            id='passkey-name'
            type='text'
            name='name'
            autocomplete='off'
            value={name}
            onInput={(event: Event) => setName((event.target as HTMLInputElement).value)}
            class={INPUT_CLASS}
          />
        </div>
        {registerError !== '' && <ErrorNotice message={registerError} />}
        <button type='submit' class={PRIMARY_BUTTON_CLASS} disabled={isRegistering}>
          パスキーを追加
        </button>
      </form>
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<SettingsPasskeysPage />, root);
}
