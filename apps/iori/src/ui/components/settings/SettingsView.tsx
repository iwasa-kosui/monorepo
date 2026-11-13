import { BlueskySettingsSection } from './BlueskySettingsSection.tsx';
import { NotificationsSettingsSection } from './NotificationsSettingsSection.tsx';
import { ProfileSettingsSection } from './ProfileSettingsSection.tsx';
import { RelaysSettingsSection } from './RelaysSettingsSection.tsx';
import { SecuritySettingsSection } from './SecuritySettingsSection.tsx';
import { XFeedSourcesSettingsSection } from './XFeedSourcesSettingsSection.tsx';

type Props = Readonly<{
  isXOwner: boolean;
  onProfileLoaded?: () => void;
}>;

export const SettingsView = ({ isXOwner, onProfileLoaded }: Props) => (
  <div>
    <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>設定</h1>
    <ProfileSettingsSection onLoaded={onProfileLoaded} />
    <NotificationsSettingsSection />
    <BlueskySettingsSection isOwner={isXOwner} />
    {isXOwner && <RelaysSettingsSection />}
    <SecuritySettingsSection />
    {isXOwner && <XFeedSourcesSettingsSection />}
  </div>
);
