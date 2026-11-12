import { useCallback, useEffect, useState } from 'hono/jsx';

import {
  blueskyCredentialChatLabel,
  blueskyCredentialDeleteFailureMessage,
  blueskyCredentialLoadFailureMessage,
  blueskyCredentialSaveFailureMessage,
  blueskyCredentialSourceLabel,
  type BlueskyCredentialStatus,
  blueskyCredentialVerifiedAtLabel,
  deleteBlueskyCredential,
  fetchBlueskyCredential,
  saveBlueskyCredential,
} from '../api/blueskyCredentialClient.ts';
import { isUnauthorizedError } from '../api/mastodonClient.ts';

type CredentialState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; message: string }>
  | Readonly<{ kind: 'ready'; status: BlueskyCredentialStatus }>;

const mutedTextClass = 'text-charcoal-light dark:text-gray-400';
const primaryButtonClass =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryButtonClass =
  'rounded-clay bg-cream dark:bg-gray-800 text-charcoal dark:text-gray-100 px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';
const inputClass =
  'w-full rounded-clay bg-cream dark:bg-gray-800 shadow-clay-sm dark:shadow-clay-dark px-4 py-2 text-charcoal dark:text-gray-100';
const boxClass = 'bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-4';

const StatusRow = ({ label, value }: Readonly<{ label: string; value: string }>) => (
  <div class='flex gap-2 text-sm'>
    <dt class={`${mutedTextClass} shrink-0`}>{label}</dt>
    <dd class='text-charcoal dark:text-gray-100 break-all'>{value}</dd>
  </div>
);

export const BlueskyCredentialStatusView = ({ status }: Readonly<{ status: BlueskyCredentialStatus }>) => (
  <div class='space-y-3'>
    <dl class={`${boxClass} space-y-1`}>
      <StatusRow label='出どころ' value={blueskyCredentialSourceLabel(status.source)} />
      <StatusRow label='ハンドル' value={status.handle ?? '未確認'} />
      <StatusRow label='DID' value={status.did ?? '未確認'} />
      <StatusRow label='DM' value={blueskyCredentialChatLabel(status.chatPermitted)} />
      <StatusRow label='最後に確かめた日時' value={blueskyCredentialVerifiedAtLabel(status.verifiedAt)} />
    </dl>
    {status.chatPermitted === false && (
      <p role='status' class='text-sm text-charcoal-light dark:text-gray-400'>
        DM を使うには、Bluesky の 設定 → プライバシーとセキュリティ → アプリパスワード で『DM
        へのアクセスを許可』を付けたアプリパスワードを作り、ここで登録し直してください。
      </p>
    )}
  </div>
);

type CredentialFormViewProps = Readonly<{
  identifier: string;
  appPassword: string;
  currentPassword: string;
  submitting: boolean;
  error: string | undefined;
  saved: boolean;
  onIdentifierInput: (value: string) => void;
  onAppPasswordInput: (value: string) => void;
  onCurrentPasswordInput: (value: string) => void;
  onSubmit: (event: Event) => void;
}>;

const valueOf = (event: Event): string => (event.target as HTMLInputElement).value;

export const CredentialFormView = (
  {
    identifier,
    appPassword,
    currentPassword,
    submitting,
    error,
    saved,
    onIdentifierInput,
    onAppPasswordInput,
    onCurrentPasswordInput,
    onSubmit,
  }: CredentialFormViewProps,
) => (
  <form class='space-y-3' onSubmit={onSubmit}>
    <label class='block space-y-1'>
      <span class={`text-sm ${mutedTextClass}`}>ハンドルまたは DID</span>
      <input
        type='text'
        class={inputClass}
        value={identifier}
        onInput={(event: Event) => onIdentifierInput(valueOf(event))}
      />
    </label>
    <label class='block space-y-1'>
      <span class={`text-sm ${mutedTextClass}`}>アプリパスワード</span>
      <input
        type='password'
        autocomplete='off'
        class={inputClass}
        value={appPassword}
        onInput={(event: Event) => onAppPasswordInput(valueOf(event))}
      />
    </label>
    <label class='block space-y-1'>
      <span class={`text-sm ${mutedTextClass}`}>iori のパスワード</span>
      <input
        type='password'
        autocomplete='current-password'
        class={inputClass}
        value={currentPassword}
        onInput={(event: Event) => onCurrentPasswordInput(valueOf(event))}
      />
    </label>
    <button type='submit' class={primaryButtonClass} disabled={submitting}>確かめて保存</button>
    {error !== undefined && <p role='alert' class='text-sm text-red-600 dark:text-red-400'>{error}</p>}
    {saved && <p role='status' class='text-sm text-charcoal dark:text-gray-100'>保存しました</p>}
  </form>
);

export const BlueskyCredentialSection = () => {
  const [state, setState] = useState<CredentialState>({ kind: 'loading' });
  const [identifier, setIdentifier] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', status: await fetchBlueskyCredential() });
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to load the Bluesky credential status:', cause);
      setState({ kind: 'error', message: blueskyCredentialLoadFailureMessage(cause) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    setSaved(false);
    try {
      const status = await saveBlueskyCredential({
        identifier: identifier.trim(),
        appPassword,
        currentPassword,
      });
      setIdentifier('');
      setAppPassword('');
      setCurrentPassword('');
      setState({ kind: 'ready', status });
      setSaved(true);
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to save the Bluesky credential:', cause);
      setError(blueskyCredentialSaveFailureMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    setSaved(false);
    try {
      setState({ kind: 'ready', status: await deleteBlueskyCredential() });
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to delete the Bluesky credential:', cause);
      setError(blueskyCredentialDeleteFailureMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div class='space-y-4'>
      {state.kind === 'loading' && <p class={mutedTextClass}>読み込んでいます</p>}
      {state.kind === 'error' && (
        <div class='space-y-3'>
          <p class={mutedTextClass}>{state.message}</p>
          <button type='button' class={primaryButtonClass} onClick={load}>もう一度読み込む</button>
        </div>
      )}
      {state.kind === 'ready' && (
        <>
          <BlueskyCredentialStatusView status={state.status} />
          {state.status.registrable
            ? (
              <CredentialFormView
                identifier={identifier}
                appPassword={appPassword}
                currentPassword={currentPassword}
                submitting={submitting}
                error={error}
                saved={saved}
                onIdentifierInput={setIdentifier}
                onAppPasswordInput={setAppPassword}
                onCurrentPasswordInput={setCurrentPassword}
                onSubmit={handleSubmit}
              />
            )
            : <p class={mutedTextClass}>登録するにはサーバーの設定が必要です。</p>}
          {state.status.source === 'settings' && (
            <button type='button' class={secondaryButtonClass} disabled={submitting} onClick={handleDelete}>
              登録を消してサーバーの secret に戻す
            </button>
          )}
          {!state.status.registrable && error !== undefined && (
            <p role='alert' class='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}
        </>
      )}
    </div>
  );
};
