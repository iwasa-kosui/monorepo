import { useXFeedSources } from '../../hooks/useXFeedSources.ts';
import { XFeedSourceManager } from '../XFeedSourceManager.tsx';
import { SettingsSection } from './SettingsSection.tsx';

export const XFeedSourcesSettingsSection = () => {
  const feed = useXFeedSources();
  return (
    <SettingsSection id='x-feed-sources' title='X の取り込み元'>
      {feed.isLoading
        ? <p class='text-charcoal-light dark:text-gray-400'>読み込み中...</p>
        : feed.loadError
        ? <p role='alert' class='text-charcoal-light dark:text-gray-400'>{feed.loadError}</p>
        : (
          <XFeedSourceManager
            sources={feed.sources}
            username={feed.username}
            isAdding={feed.isAdding}
            addError={feed.addError}
            togglingIds={feed.togglingIds}
            toggleError={feed.toggleError}
            onUsernameInput={feed.setUsername}
            onAdd={feed.add}
            onToggle={feed.toggle}
          />
        )}
    </SettingsSection>
  );
};
