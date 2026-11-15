import type { BlueskyStatus } from '../../api/mastodonClient.ts';
import { useBlueskyStatus } from '../../hooks/useBlueskyStatus.ts';
import { BlueskyCredentialSection } from '../BlueskyCredentialSection.tsx';
import { BlueskyStatusNotice } from '../BlueskyStatusNotice.tsx';
import { SettingsSection } from './SettingsSection.tsx';

type Props = Readonly<{
  status: BlueskyStatus | undefined;
}>;

// Bluesky のアカウントはユーザーごとにつなぐので、だれでも自分のアカウントを設定できる
export const BlueskySettingsView = ({ status }: Props) => (
  <SettingsSection id='bluesky' title='Bluesky の連携'>
    <div class='space-y-4'>
      <BlueskyCredentialSection />
      <BlueskyStatusNotice status={status} page='home' clientLoadFailed={false} />
      <BlueskyStatusNotice status={status} page='notifications' clientLoadFailed={false} />
    </div>
  </SettingsSection>
);

export const BlueskySettingsSection = () => {
  const { status } = useBlueskyStatus();
  return <BlueskySettingsView status={status} />;
};
