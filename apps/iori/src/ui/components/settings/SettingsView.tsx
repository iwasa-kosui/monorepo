import { useState } from 'hono/jsx';

import { BlueskyProfileSettingsSection } from './BlueskyProfileSettingsSection.tsx';
import { BlueskySettingsSection } from './BlueskySettingsSection.tsx';
import { NotificationsSettingsSection } from './NotificationsSettingsSection.tsx';
import { PostingSettingsSection } from './PostingSettingsSection.tsx';
import { ProfileSettingsSection } from './ProfileSettingsSection.tsx';
import { RelaysSettingsSection } from './RelaysSettingsSection.tsx';
import { SecuritySettingsSection } from './SecuritySettingsSection.tsx';
import { XFeedSourcesSettingsSection } from './XFeedSourcesSettingsSection.tsx';

type Props = Readonly<{
  isOwner: boolean;
  onProfileLoaded?: () => void;
}>;

export const SettingsView = ({ isOwner, onProfileLoaded }: Props) => {
  const [blueskyProfileRevision, setBlueskyProfileRevision] = useState(0);
  return (
    <div>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>設定</h1>
      <ProfileSettingsSection
        onLoaded={onProfileLoaded}
        onBlueskyProfileSaved={() => setBlueskyProfileRevision((revision) => revision + 1)}
      />
      <NotificationsSettingsSection />
      <PostingSettingsSection />
      <BlueskySettingsSection />
      <BlueskyProfileSettingsSection revision={blueskyProfileRevision} />
      {isOwner && <RelaysSettingsSection />}
      <SecuritySettingsSection />
      {isOwner && <XFeedSourcesSettingsSection />}
    </div>
  );
};
