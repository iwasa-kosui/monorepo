import { BlueskySettingsSection } from './BlueskySettingsSection.tsx';
import { NotificationsSettingsSection } from './NotificationsSettingsSection.tsx';
import { ProfileSettingsSection } from './ProfileSettingsSection.tsx';
import { RelaysSettingsSection } from './RelaysSettingsSection.tsx';
import { XFeedSourcesSettingsSection } from './XFeedSourcesSettingsSection.tsx';

type Props = Readonly<{
  isXOwner: boolean;
}>;

export const SettingsView = ({ isXOwner }: Props) => (
  <div>
    <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>設定</h1>
    <ProfileSettingsSection />
    <NotificationsSettingsSection />
    <BlueskySettingsSection />
    <RelaysSettingsSection />
    {isXOwner && <XFeedSourcesSettingsSection />}
  </div>
);
