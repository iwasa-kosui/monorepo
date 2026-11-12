import { useEffect, useState } from 'hono/jsx';

import type { CredentialAccount } from '../../../adaptor/mastodon/entities.ts';
import { fetchVerifyCredentials, isUnauthorizedError, updateProfile } from '../../api/mastodonClient.ts';
import { ProfileFormFields } from '../ProfileFormFields.tsx';
import { isEmptyProfileUpdate, toProfileUpdate } from '../profileUpdate.ts';
import { SettingsSection } from './SettingsSection.tsx';

type Props = Readonly<{
  me: CredentialAccount | undefined;
  loadFailed: boolean;
  isSubmitting: boolean;
  errorText: string | undefined;
  savedMessage: string | undefined;
  formKey: number;
  onSubmit: (e: Event) => void;
}>;

export const ProfileSettingsForm = (
  { me, loadFailed, isSubmitting, errorText, savedMessage, formKey, onSubmit }: Props,
) => (
  <SettingsSection id='profile' title='プロフィール'>
    {me === undefined
      ? (
        <p class='text-charcoal-light dark:text-gray-400'>
          {loadFailed ? 'プロフィールを読み込めませんでした' : '読み込み中...'}
        </p>
      )
      : (
        <form
          key={formKey}
          onSubmit={onSubmit}
          class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5'
        >
          <ProfileFormFields
            idPrefix='settings-profile'
            displayName={me.display_name}
            note={me.source.note}
            errorText={errorText}
          />
          {savedMessage !== undefined && (
            <p role='status' class='text-sage-dark dark:text-sage text-sm mb-3'>{savedMessage}</p>
          )}
          <div class='flex justify-end'>
            <button
              type='submit'
              disabled={isSubmitting}
              class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
            >
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      )}
  </SettingsSection>
);

type SectionProps = Readonly<{
  onLoaded?: (() => void) | undefined;
}>;

export const ProfileSettingsSection = ({ onLoaded }: SectionProps) => {
  const [me, setMe] = useState<CredentialAccount | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const [savedMessage, setSavedMessage] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    fetchVerifyCredentials().then((account) => {
      setMe(account);
      onLoaded?.();
    }, (error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = '/sign-in';
        return;
      }
      setLoadFailed(true);
      onLoaded?.();
    });
  }, []);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (me === undefined || isSubmitting) return;
    setSavedMessage(undefined);
    const update = toProfileUpdate(new FormData(e.currentTarget as HTMLFormElement), {
      displayName: me.display_name,
      note: me.source.note,
    });
    if (isEmptyProfileUpdate(update)) {
      setSavedMessage('変更がありません');
      return;
    }
    setIsSubmitting(true);
    setErrorText(undefined);
    try {
      setMe(await updateProfile(update));
      setFormKey((key) => key + 1);
      setSavedMessage('プロフィールを保存しました');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ProfileSettingsForm
      me={me}
      loadFailed={loadFailed}
      isSubmitting={isSubmitting}
      errorText={errorText}
      savedMessage={savedMessage}
      formKey={formKey}
      onSubmit={handleSubmit}
    />
  );
};
