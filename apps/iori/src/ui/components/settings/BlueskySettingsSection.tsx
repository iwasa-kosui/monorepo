import type { BlueskyStatus } from '../../api/mastodonClient.ts';
import { useBlueskyStatus } from '../../hooks/useBlueskyStatus.ts';
import { BlueskyCredentialSection } from '../BlueskyCredentialSection.tsx';
import { blueskyConnectionLabel } from '../blueskySettings.ts';
import { BlueskyStatusNotice } from '../BlueskyStatusNotice.tsx';
import { SettingsSection } from './SettingsSection.tsx';

type Props = Readonly<{
  status: BlueskyStatus | undefined;
  loadFailed: boolean;
  isOwner: boolean;
}>;

export const BlueskySettingsView = ({ status, loadFailed, isOwner }: Props) => (
  <SettingsSection id='bluesky' title='Bluesky の連携'>
    <div class='space-y-4'>
      {isOwner
        ? <BlueskyCredentialSection />
        : (
          <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5'>
            <p class='text-sm font-medium text-charcoal dark:text-white'>
              {blueskyConnectionLabel({ status, loadFailed })}
            </p>
          </div>
        )}
      <BlueskyStatusNotice status={status} page='home' clientLoadFailed={false} />
      <BlueskyStatusNotice status={status} page='notifications' clientLoadFailed={false} />
    </div>
  </SettingsSection>
);

type SectionProps = Readonly<{
  isOwner: boolean;
}>;

export const BlueskySettingsSection = ({ isOwner }: SectionProps) => {
  const { status, loadFailed } = useBlueskyStatus();
  return <BlueskySettingsView status={status} loadFailed={loadFailed} isOwner={isOwner} />;
};
