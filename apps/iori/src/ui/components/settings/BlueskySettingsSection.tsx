import type { BlueskyStatus } from '../../api/mastodonClient.ts';
import { useBlueskyStatus } from '../../hooks/useBlueskyStatus.ts';
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
    <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 space-y-3'>
      <p class='text-sm font-medium text-charcoal dark:text-white'>{blueskyConnectionLabel({ status, loadFailed })}</p>
      <BlueskyStatusNotice status={status} page='home' clientLoadFailed={false} />
      <BlueskyStatusNotice status={status} page='notifications' clientLoadFailed={false} />
      {isOwner && (
        <p class='text-sm text-charcoal-light dark:text-gray-400'>
          Bluesky のアカウントを変えるには、BLUESKY_IDENTIFIER と BLUESKY_APP_PASSWORD の secret
          を差し替えて、デプロイしてください。
        </p>
      )}
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
