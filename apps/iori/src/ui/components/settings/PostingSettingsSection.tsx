import { useEffect, useState } from 'hono/jsx';

import { fetchPreferences, isUnauthorizedError, savePreferences } from '../../api/mastodonClient.ts';
import { DEFAULT_POST_VISIBILITY, type PostVisibility } from '../postVisibility.ts';
import { PostVisibilitySelect } from '../PostVisibilitySelect.tsx';
import { SettingsSection } from './SettingsSection.tsx';

type Props = Readonly<{
  visibility: PostVisibility;
  loadFailed: boolean;
  isSaving: boolean;
  savedMessage: string | undefined;
  errorText: string | undefined;
  onChange: (visibility: PostVisibility) => void;
  onSave: () => void;
}>;

export const PostingSettingsView = (
  { visibility, loadFailed, isSaving, savedMessage, errorText, onChange, onSave }: Props,
) => (
  <SettingsSection id='posting' title='投稿'>
    <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 space-y-3'>
      <p class='text-sm text-charcoal-light dark:text-gray-400'>新しい投稿の公開範囲の初期値を選びます。</p>
      {loadFailed && (
        <p role='alert' class='text-sm text-terracotta dark:text-terracotta-light'>
          設定を読み込めませんでした
        </p>
      )}
      <PostVisibilitySelect
        value={visibility}
        onChange={onChange}
        name='defaultPostVisibility'
        id='settings-posting-visibility'
      />
      <p class='text-xs text-charcoal-light dark:text-gray-400'>公開以外を選んだ投稿は Bluesky に送られません。</p>
      {errorText !== undefined && (
        <p role='alert' class='text-sm text-terracotta dark:text-terracotta-light'>{errorText}</p>
      )}
      {savedMessage !== undefined && <p role='status' class='text-sage-dark dark:text-sage text-sm'>{savedMessage}</p>}
      <div class='flex justify-end'>
        <button
          type='button'
          disabled={isSaving}
          onClick={onSave}
          class='px-5 py-2 bg-terracotta hover:bg-terracotta-dark disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
        >
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  </SettingsSection>
);

export const PostingSettingsSection = () => {
  const [visibility, setVisibility] = useState<PostVisibility>(DEFAULT_POST_VISIBILITY);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | undefined>(undefined);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchPreferences().then((preferences) => {
      setVisibility(preferences.defaultPostVisibility);
    }, (error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = '/sign-in';
        return;
      }
      setLoadFailed(true);
    });
  }, []);

  const handleChange = (next: PostVisibility) => {
    setVisibility(next);
    setSavedMessage(undefined);
    setErrorText(undefined);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSavedMessage(undefined);
    setErrorText(undefined);
    try {
      const saved = await savePreferences({ defaultPostVisibility: visibility });
      setVisibility(saved.defaultPostVisibility);
      setSavedMessage('保存しました');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        window.location.href = '/sign-in';
        return;
      }
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PostingSettingsView
      visibility={visibility}
      loadFailed={loadFailed}
      isSaving={isSaving}
      savedMessage={savedMessage}
      errorText={errorText}
      onChange={handleChange}
      onSave={handleSave}
    />
  );
};
