import { useCallback, useEffect, useState } from 'hono/jsx';

import {
  fetchOwnBlueskyProfile,
  type OwnBlueskyProfile,
  ownBlueskyProfileSaveFailureMessage,
  updateOwnBlueskyProfile,
} from '../../api/blueskyProfileClient.ts';
import type { BlueskyStatus } from '../../api/mastodonClient.ts';
import { useBlueskyStatus } from '../../hooks/useBlueskyStatus.ts';
import {
  BLUESKY_DESCRIPTION_MAX_GRAPHEMES,
  BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES,
  blueskyProfileImageProblem,
  buildBlueskyProfileFormData,
  graphemeCounterLabel,
  isWithinGraphemeLimit,
  selectedImageFile,
} from '../blueskyProfileEdit.ts';
import { downscaleImageForUpload } from '../imageDownscale.ts';
import { SettingsSection } from './SettingsSection.tsx';

const FIELD_CLASS =
  'w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset mb-1 transition-all';
const LABEL_CLASS = 'block text-charcoal-light dark:text-gray-400 text-sm mb-1';
const COUNTER_CLASS = 'text-xs mb-3';
const CHECKBOX_LABEL_CLASS = 'flex items-center gap-2 text-sm text-charcoal-light dark:text-gray-400 mb-3';
const RETRY_BUTTON_CLASS =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';
const ID_PREFIX = 'bluesky-profile';
const IMAGE_ACCEPT = 'image/jpeg,image/png';
const LOAD_FAILED_MESSAGE = 'Bluesky のプロフィールを読み込めませんでした';
const SAVED_MESSAGE = 'Bluesky のプロフィールを保存しました';

const counterClass = (text: string, max: number): string =>
  `${COUNTER_CLASS} ${isWithinGraphemeLimit(text, max) ? 'text-charcoal-light dark:text-gray-400' : 'text-terracotta'}`;

type Props = Readonly<{
  profile: OwnBlueskyProfile | undefined;
  loadFailed: boolean;
  displayName: string;
  description: string;
  isSubmitting: boolean;
  errorText: string | undefined;
  savedMessage: string | undefined;
  formKey: number;
  onReload: () => void;
  onDisplayNameInput: (value: string) => void;
  onDescriptionInput: (value: string) => void;
  onSubmit: (e: Event) => void;
}>;

export const BlueskyProfileSettingsForm = (
  {
    profile,
    loadFailed,
    displayName,
    description,
    isSubmitting,
    errorText,
    savedMessage,
    formKey,
    onReload,
    onDisplayNameInput,
    onDescriptionInput,
    onSubmit,
  }: Props,
) => (
  <SettingsSection id='bluesky-profile' title='Bluesky のプロフィール'>
    {profile === undefined
      ? (
        <div class='space-y-3'>
          <p class='text-charcoal-light dark:text-gray-400'>
            {loadFailed ? LOAD_FAILED_MESSAGE : '読み込み中...'}
          </p>
          {loadFailed && <button type='button' class={RETRY_BUTTON_CLASS} onClick={onReload}>もう一度読み込む</button>}
        </div>
      )
      : (
        <form
          key={formKey}
          onSubmit={onSubmit}
          class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5'
        >
          <label class={LABEL_CLASS} for={`${ID_PREFIX}-display-name`}>表示名</label>
          <input
            id={`${ID_PREFIX}-display-name`}
            type='text'
            name='display_name'
            value={displayName}
            onInput={(e: Event) => onDisplayNameInput((e.currentTarget as HTMLInputElement).value)}
            class={FIELD_CLASS}
          />
          <p class={counterClass(displayName, BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES)}>
            {graphemeCounterLabel(displayName, BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES)}
          </p>
          <label class={LABEL_CLASS} for={`${ID_PREFIX}-description`}>自己紹介</label>
          <textarea
            id={`${ID_PREFIX}-description`}
            name='description'
            value={description}
            rows={4}
            onInput={(e: Event) => onDescriptionInput((e.currentTarget as HTMLTextAreaElement).value)}
            class={FIELD_CLASS}
          />
          <p class={counterClass(description, BLUESKY_DESCRIPTION_MAX_GRAPHEMES)}>
            {graphemeCounterLabel(description, BLUESKY_DESCRIPTION_MAX_GRAPHEMES)}
          </p>
          <label class={LABEL_CLASS} for={`${ID_PREFIX}-avatar`}>アバター（JPEG か PNG。1MB まで）</label>
          {profile.avatar !== null && (
            <img
              src={profile.avatar}
              alt='現在のアバター'
              class='w-16 h-16 rounded-full object-cover mb-2'
            />
          )}
          <input
            id={`${ID_PREFIX}-avatar`}
            type='file'
            name='avatar'
            accept={IMAGE_ACCEPT}
            class={`${FIELD_CLASS} mb-3`}
          />
          {profile.avatar !== null && (
            <label class={CHECKBOX_LABEL_CLASS}>
              <input type='checkbox' name='remove_avatar' />
              アバターを削除
            </label>
          )}
          <label class={LABEL_CLASS} for={`${ID_PREFIX}-banner`}>バナー（JPEG か PNG。1MB まで）</label>
          {profile.banner !== null && (
            <img
              src={profile.banner}
              alt='現在のバナー'
              class='w-full h-24 rounded-clay object-cover mb-2'
            />
          )}
          <input
            id={`${ID_PREFIX}-banner`}
            type='file'
            name='banner'
            accept={IMAGE_ACCEPT}
            class={`${FIELD_CLASS} mb-3`}
          />
          {profile.banner !== null && (
            <label class={CHECKBOX_LABEL_CLASS}>
              <input type='checkbox' name='remove_banner' />
              バナーを削除
            </label>
          )}
          {errorText !== undefined && <p class='text-terracotta text-sm mb-3'>{errorText}</p>}
          {savedMessage !== undefined && (
            <p role='status' class='text-sage-dark dark:text-sage text-sm mb-3'>{savedMessage}</p>
          )}
          <div class='flex justify-end'>
            <button
              type='submit'
              disabled={isSubmitting
                || !isWithinGraphemeLimit(displayName, BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES)
                || !isWithinGraphemeLimit(description, BLUESKY_DESCRIPTION_MAX_GRAPHEMES)}
              class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
            >
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      )}
  </SettingsSection>
);

const BlueskyProfileSettingsEditor = () => {
  const [profile, setProfile] = useState<OwnBlueskyProfile | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const [savedMessage, setSavedMessage] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    const next = await fetchOwnBlueskyProfile();
    setProfile(next);
    setDisplayName(next.displayName ?? '');
    setDescription(next.description ?? '');
    setLoadFailed(false);
  }, []);

  const reload = useCallback(() => {
    setLoadFailed(false);
    load().catch((error) => {
      console.error('Failed to load the Bluesky profile:', error);
      setLoadFailed(true);
    });
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  const prepareImage = async (
    value: FormDataEntryValue | null,
    label: string,
  ): Promise<Readonly<{ file: File | undefined; problem: string | undefined }>> => {
    const selected = selectedImageFile(value);
    if (selected === undefined) return { file: undefined, problem: undefined };
    const file = await downscaleImageForUpload(selected);
    return { file, problem: blueskyProfileImageProblem(file, label) };
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (isSubmitting) return;
    const form = new FormData(e.currentTarget as HTMLFormElement);
    setSavedMessage(undefined);
    setErrorText(undefined);
    setIsSubmitting(true);
    try {
      const avatar = await prepareImage(form.get('avatar'), 'アバター');
      const banner = await prepareImage(form.get('banner'), 'バナー');
      const problem = avatar.problem ?? banner.problem;
      if (problem !== undefined) {
        setErrorText(problem);
        return;
      }
      await updateOwnBlueskyProfile(buildBlueskyProfileFormData({
        displayName,
        description,
        avatar: avatar.file,
        banner: banner.file,
        removeAvatar: form.get('remove_avatar') !== null,
        removeBanner: form.get('remove_banner') !== null,
      }));
      setFormKey((key) => key + 1);
      setSavedMessage(SAVED_MESSAGE);
      // 反映に時間差がありうるので、取り直しに失敗しても成功メッセージは残す
      await load().catch((error) => console.error('Failed to reload the Bluesky profile:', error));
    } catch (error) {
      setErrorText(ownBlueskyProfileSaveFailureMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BlueskyProfileSettingsForm
      profile={profile}
      loadFailed={loadFailed}
      displayName={displayName}
      description={description}
      isSubmitting={isSubmitting}
      errorText={errorText}
      savedMessage={savedMessage}
      formKey={formKey}
      onReload={reload}
      onDisplayNameInput={setDisplayName}
      onDescriptionInput={setDescription}
      onSubmit={handleSubmit}
    />
  );
};

type GateProps = Readonly<{
  status: BlueskyStatus | undefined;
  isOwner: boolean;
}>;

export const BlueskyProfileSettingsGate = ({ status, isOwner }: GateProps) =>
  status?.enabled === true && isOwner ? <BlueskyProfileSettingsEditor /> : null;

type SectionProps = Readonly<{
  isOwner: boolean;
}>;

export const BlueskyProfileSettingsSection = ({ isOwner }: SectionProps) => {
  const { status } = useBlueskyStatus();
  return <BlueskyProfileSettingsGate status={status} isOwner={isOwner} />;
};
