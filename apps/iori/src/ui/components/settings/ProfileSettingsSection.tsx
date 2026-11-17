import { useEffect, useState } from 'hono/jsx';

import type { CredentialAccount } from '../../../adaptor/mastodon/entities.ts';
import {
  fetchOwnBlueskyProfile,
  ownBlueskyProfileSaveFailureMessage,
  updateOwnBlueskyProfile,
} from '../../api/blueskyProfileClient.ts';
import { fetchVerifyCredentials, isUnauthorizedError, updateProfile } from '../../api/mastodonClient.ts';
import { profileHeaderUrl } from '../../api/profileHeader.ts';
import { useBlueskyStatus } from '../../hooks/useBlueskyStatus.ts';
import { blueskyProfileImageProblem, buildBlueskyProfileFormData } from '../blueskyProfileEdit.ts';
import { downscaleImageForUpload } from '../imageDownscale.ts';
import {
  blueskySyncTextProblem,
  type ProfileSyncForm,
  readProfileSyncForm,
  toBlueskyProfileSubmission,
} from '../profileBlueskySync.ts';
import { ProfileFormFields } from '../ProfileFormFields.tsx';
import { isEmptyProfileUpdate, toProfileUpdate } from '../profileUpdate.ts';
import { SettingsSection } from './SettingsSection.tsx';

const SAVED_MESSAGE = 'プロフィールを保存しました';
const SAVED_WITH_BLUESKY_MESSAGE = 'プロフィールを保存し、Bluesky にも反映しました';

type BlueskySyncProps = Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}>;

type Props = Readonly<{
  me: CredentialAccount | undefined;
  loadFailed: boolean;
  isSubmitting: boolean;
  errorText: string | undefined;
  savedMessage: string | undefined;
  formKey: number;
  /** Bluesky のアカウントをつないでいるときだけ渡す。Bluesky へも同じ内容を保存するかの選択 */
  blueskySync?: BlueskySyncProps | undefined;
  onSubmit: (e: Event) => void;
}>;

export const ProfileSettingsForm = (
  { me, loadFailed, isSubmitting, errorText, savedMessage, formKey, blueskySync, onSubmit }: Props,
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
            headerUrl={profileHeaderUrl(me.header)}
            errorText={errorText}
          />
          {blueskySync !== undefined && (
            <div class='mb-3'>
              <label class='flex items-center gap-2 text-sm text-charcoal dark:text-gray-200'>
                <input
                  type='checkbox'
                  checked={blueskySync.checked}
                  onChange={(e: Event) => blueskySync.onChange((e.currentTarget as HTMLInputElement).checked)}
                />
                Bluesky のプロフィールにも同じ内容を保存する
              </label>
              <p class='text-xs text-charcoal-light dark:text-gray-400 mt-1'>
                表示名と自己紹介、ここで選んだ画像を Bluesky にも反映します。
              </p>
            </div>
          )}
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

type BlueskyImages = Readonly<{ avatar: File | undefined; banner: File | undefined }>;

/** Bluesky は 1MB までの JPEG か PNG しか受け付けないので、送る前に縮めて確かめる */
const prepareBlueskyImages = async (
  form: ProfileSyncForm,
): Promise<Readonly<{ images: BlueskyImages; problem: string | undefined }>> => {
  const avatar = form.avatar === undefined ? undefined : await downscaleImageForUpload(form.avatar);
  const banner = form.header === undefined ? undefined : await downscaleImageForUpload(form.header);
  const problem = (avatar === undefined ? undefined : blueskyProfileImageProblem(avatar, 'Bluesky のアバター'))
    ?? (banner === undefined ? undefined : blueskyProfileImageProblem(banner, 'Bluesky のバナー'));
  return { images: { avatar, banner }, problem };
};

type SectionProps = Readonly<{
  onLoaded?: (() => void) | undefined;
  onBlueskyProfileSaved?: (() => void) | undefined;
}>;

export const ProfileSettingsSection = ({ onLoaded, onBlueskyProfileSaved }: SectionProps) => {
  const { status: blueskyStatus } = useBlueskyStatus();
  const [me, setMe] = useState<CredentialAccount | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const [savedMessage, setSavedMessage] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  const [syncToBluesky, setSyncToBluesky] = useState(false);

  const blueskyConnected = blueskyStatus?.enabled === true;

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
    setErrorText(undefined);
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const update = toProfileUpdate(form, { displayName: me.display_name, note: me.source.note });
    const syncForm = blueskyConnected && syncToBluesky ? readProfileSyncForm(form) : undefined;
    if (syncForm === undefined && isEmptyProfileUpdate(update)) {
      setSavedMessage('変更がありません');
      return;
    }
    setIsSubmitting(true);
    try {
      // Bluesky に送れない内容は、片方だけ保存されて終わらないよう、どちらにも保存する前に止める
      const textProblem = syncForm === undefined ? undefined : blueskySyncTextProblem(syncForm);
      const prepared = syncForm === undefined || textProblem !== undefined
        ? undefined
        : await prepareBlueskyImages(syncForm);
      const problem = textProblem ?? prepared?.problem;
      if (problem !== undefined) {
        setErrorText(problem);
        return;
      }
      if (!isEmptyProfileUpdate(update)) setMe(await updateProfile(update));
      if (syncForm === undefined || prepared === undefined) {
        setFormKey((key) => key + 1);
        setSavedMessage(SAVED_MESSAGE);
        return;
      }
      try {
        const current = await fetchOwnBlueskyProfile();
        await updateOwnBlueskyProfile(
          buildBlueskyProfileFormData(toBlueskyProfileSubmission(syncForm, prepared.images, current.cid)),
        );
      } catch (error) {
        console.error('Failed to save the Bluesky profile:', error);
        // 選んだ画像を残して、もう一度保存を押せばやり直せるようにする
        setErrorText(
          `こちらのプロフィールは保存しましたが、Bluesky には反映できませんでした（${
            ownBlueskyProfileSaveFailureMessage(error)
          }）`,
        );
        return;
      }
      setFormKey((key) => key + 1);
      setSavedMessage(SAVED_WITH_BLUESKY_MESSAGE);
      onBlueskyProfileSaved?.();
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
      blueskySync={blueskyConnected ? { checked: syncToBluesky, onChange: setSyncToBluesky } : undefined}
      onSubmit={handleSubmit}
    />
  );
};
