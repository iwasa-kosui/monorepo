import { PushSubscriptionSection } from '../PushSubscriptionSection.tsx';
import { SettingsSection } from './SettingsSection.tsx';

export const NotificationsSettingsSection = () => (
  <SettingsSection id='notifications' title='通知'>
    <PushSubscriptionSection />
  </SettingsSection>
);
