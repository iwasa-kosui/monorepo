import { useCallback, useEffect, useState } from 'hono/jsx';

import {
  blueskyAccountSwitchCountRows,
  type BlueskyAccountSwitchCounts,
  blueskyAccountSwitchFailureMessage,
  type BlueskyAccountSwitchState,
  blueskyCredentialChatLabel,
  blueskyCredentialDeleteFailureMessage,
  blueskyCredentialLoadFailureMessage,
  blueskyCredentialSaveFailureMessage,
  blueskyCredentialSourceLabel,
  type BlueskyCredentialStatus,
  blueskyCredentialVerifiedAtLabel,
  type BlueskyDidMismatch,
  blueskyDidMismatchOf,
  deleteBlueskyCredential,
  fetchBlueskyAccountSwitch,
  fetchBlueskyAccountSwitchPreview,
  fetchBlueskyCredential,
  isBlueskyAccountChangedError,
  isBlueskyAccountSwitchConfirmed,
  saveBlueskyCredential,
  startBlueskyAccountSwitch,
} from '../api/blueskyCredentialClient.ts';
import { isUnauthorizedError } from '../api/mastodonClient.ts';
import { clearAllCache } from '../api/responseCache.ts';
import { clearHomeSnapshot } from '../hooks/homeSnapshot.ts';

type CredentialState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; message: string }>
  | Readonly<{ kind: 'ready'; status: BlueskyCredentialStatus }>;

type PreviewState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error' }>
  | Readonly<{ kind: 'ready'; counts: BlueskyAccountSwitchCounts }>;

type PendingSwitch = Readonly<{
  identifier: string;
  appPassword: string;
  mismatch: BlueskyDidMismatch;
}>;

const SWITCH_POLL_INTERVAL_MS = 10_000;

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

type AccountSwitchConfirmViewProps = Readonly<{
  mismatch: BlueskyDidMismatch;
  preview: PreviewState;
  confirmHandle: string;
  currentPassword: string;
  submitting: boolean;
  error: string | undefined;
  onConfirmHandleInput: (value: string) => void;
  onCurrentPasswordInput: (value: string) => void;
  onSubmit: (event: Event) => void;
  onCancel: () => void;
  onRetryPreview: () => void;
}>;

export const AccountSwitchConfirmView = (
  {
    mismatch,
    preview,
    confirmHandle,
    currentPassword,
    submitting,
    error,
    onConfirmHandleInput,
    onCurrentPasswordInput,
    onSubmit,
    onCancel,
    onRetryPreview,
  }: AccountSwitchConfirmViewProps,
) => (
  <form class={`${boxClass} space-y-3`} onSubmit={onSubmit}>
    <h3 class='text-base font-medium text-charcoal dark:text-white'>アカウントの切り替え</h3>
    <dl class='space-y-1'>
      <StatusRow label='いまのアカウント' value={mismatch.current.handle ?? mismatch.current.did} />
      <StatusRow label='新しいアカウント' value={mismatch.next.handle} />
    </dl>
    <div class='space-y-1'>
      <p class='text-sm text-charcoal dark:text-gray-100'>
        切り替えると、前のアカウントのために iori に保存したデータを消します。
      </p>
      {preview.kind === 'loading' && <p class={`text-sm ${mutedTextClass}`}>削除する件数を読み込んでいます</p>}
      {preview.kind === 'error' && (
        <div class='space-y-2'>
          <p role='alert' class='text-sm text-red-600 dark:text-red-400'>件数を読み込めませんでした。</p>
          <button type='button' class={secondaryButtonClass} disabled={submitting} onClick={onRetryPreview}>
            再読み込み
          </button>
        </div>
      )}
      {preview.kind === 'ready' && (
        <dl class='space-y-1'>
          {blueskyAccountSwitchCountRows(preview.counts).map((row) => (
            <StatusRow label={row.label} value={`${row.count} 件`} />
          ))}
        </dl>
      )}
    </div>
    <ul class='list-disc pl-5 space-y-1 text-sm text-charcoal dark:text-gray-100'>
      <li>削除の対象には、iori の中のブックマーク、ミュート、ブロックも入ります。</li>
      <li>
        自分の投稿と前の Bluesky の投稿との結び付き（送信済みのアイコンのリンクと、引用のときの Bluesky
        の引用）も消えます。
      </li>
      <li>前のアカウントの Bluesky 上の投稿、いいね、フォローは残ります。</li>
      <li>iori の投稿と Fediverse のデータは消えません。</li>
      <li>前のアカウントに送った投稿は、新しいアカウントには送り直しません。</li>
    </ul>
    <label class='block space-y-1'>
      <span class={`text-sm ${mutedTextClass}`}>確認のため、新しいアカウントのハンドルを入力してください</span>
      <input
        type='text'
        autocomplete='off'
        class={inputClass}
        value={confirmHandle}
        onInput={(event: Event) => onConfirmHandleInput(valueOf(event))}
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
    <div class='flex gap-2'>
      <button
        type='submit'
        class={primaryButtonClass}
        disabled={submitting || preview.kind !== 'ready'
          || !isBlueskyAccountSwitchConfirmed(confirmHandle, mismatch.next.handle)}
      >
        切り替えてデータを消す
      </button>
      <button type='button' class={secondaryButtonClass} disabled={submitting} onClick={onCancel}>やめる</button>
    </div>
    {error !== undefined && <p role='alert' class='text-sm text-red-600 dark:text-red-400'>{error}</p>}
  </form>
);

export const AccountSwitchStatusView = (
  { state, finished }: Readonly<{ state: BlueskyAccountSwitchState | undefined; finished: boolean }>,
) => (
  <>
    {state?.state === 'purging' && (
      <div class={`${boxClass} space-y-1`}>
        <p role='status' class='text-sm text-charcoal dark:text-gray-100'>
          切り替え中です。前のアカウントのデータを消しています。
        </p>
        <p class={`text-sm ${mutedTextClass}`}>試行回数: {state.attempts} 回</p>
        {state.lastError !== null && <p class={`text-sm break-all ${mutedTextClass}`}>{state.lastError}</p>}
        {state.stalled && <p role='alert' class='text-sm text-red-600 dark:text-red-400'>切り替えが止まっています。</p>}
      </div>
    )}
    {finished && state?.state !== 'purging' && (
      <p role='status' class='text-sm text-charcoal dark:text-gray-100'>切り替えが終わりました。</p>
    )}
  </>
);

export const BlueskyCredentialSection = () => {
  const [state, setState] = useState<CredentialState>({ kind: 'loading' });
  const [identifier, setIdentifier] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [switchState, setSwitchState] = useState<BlueskyAccountSwitchState | undefined>(undefined);
  const [switchFinished, setSwitchFinished] = useState(false);
  const [pending, setPending] = useState<PendingSwitch | undefined>(undefined);
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' });
  const [confirmHandle, setConfirmHandle] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState<string | undefined>(undefined);

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

  const refreshStatus = useCallback(async () => {
    try {
      setState({ kind: 'ready', status: await fetchBlueskyCredential() });
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to refresh the Bluesky credential status:', cause);
    }
  }, []);

  const loadSwitch = useCallback(async () => {
    try {
      setSwitchState(await fetchBlueskyAccountSwitch());
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to load the Bluesky account switch state:', cause);
    }
  }, []);

  const pollSwitch = useCallback(async () => {
    try {
      const next = await fetchBlueskyAccountSwitch();
      setSwitchState(next);
      if (next.state === 'idle') {
        setSwitchFinished(true);
        await refreshStatus();
      }
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to poll the Bluesky account switch state:', cause);
    }
  }, [refreshStatus]);

  const loadPreview = useCallback(async () => {
    setPreview({ kind: 'loading' });
    try {
      setPreview({ kind: 'ready', counts: (await fetchBlueskyAccountSwitchPreview()).counts });
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to load the Bluesky account switch preview:', cause);
      setPreview({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
    void loadSwitch();
  }, [load, loadSwitch]);

  const purging = switchState?.state === 'purging';

  useEffect(() => {
    if (!purging) return;
    const timer = setInterval(() => void pollSwitch(), SWITCH_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [purging, pollSwitch]);

  const closeConfirm = () => {
    setPending(undefined);
    setConfirmHandle('');
    setSwitchPassword('');
    setSwitchError(undefined);
  };

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
      const mismatch = blueskyDidMismatchOf(cause);
      if (mismatch !== undefined) {
        setPending({ identifier: identifier.trim(), appPassword, mismatch });
        setIdentifier('');
        setAppPassword('');
        setCurrentPassword('');
        void loadPreview();
        return;
      }
      console.error('Failed to save the Bluesky credential:', cause);
      setError(blueskyCredentialSaveFailureMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitch = async (event: Event) => {
    event.preventDefault();
    if (submitting || pending === undefined || preview.kind !== 'ready') return;
    if (!isBlueskyAccountSwitchConfirmed(confirmHandle, pending.mismatch.next.handle)) return;
    setSubmitting(true);
    setSwitchError(undefined);
    setError(undefined);
    setSaved(false);
    try {
      const next = await startBlueskyAccountSwitch({
        identifier: pending.identifier,
        appPassword: pending.appPassword,
        currentPassword: switchPassword,
        fromDid: pending.mismatch.current.did,
        toDid: pending.mismatch.next.did,
      });
      closeConfirm();
      clearAllCache();
      clearHomeSnapshot();
      setSwitchState(next);
      setSwitchFinished(false);
      void refreshStatus();
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to switch the Bluesky account:', cause);
      if (isBlueskyAccountChangedError(cause)) {
        closeConfirm();
        setError(blueskyAccountSwitchFailureMessage(cause));
        void refreshStatus();
      } else {
        setSwitchError(blueskyAccountSwitchFailureMessage(cause));
      }
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
          <AccountSwitchStatusView state={switchState} finished={switchFinished} />
          {!purging && pending !== undefined && (
            <AccountSwitchConfirmView
              mismatch={pending.mismatch}
              preview={preview}
              confirmHandle={confirmHandle}
              currentPassword={switchPassword}
              submitting={submitting}
              error={switchError}
              onConfirmHandleInput={setConfirmHandle}
              onCurrentPasswordInput={setSwitchPassword}
              onSubmit={handleSwitch}
              onCancel={closeConfirm}
              onRetryPreview={loadPreview}
            />
          )}
          {!purging && pending === undefined && (state.status.registrable
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
            : <p class={mutedTextClass}>登録するにはサーバーの設定が必要です。</p>)}
          {!purging && state.status.source === 'settings' && (
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
