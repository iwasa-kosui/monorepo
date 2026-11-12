import { SettingsSection } from './SettingsSection.tsx';

export const SecuritySettingsSection = () => (
  <SettingsSection id='security' title='セキュリティ'>
    <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 space-y-3'>
      <p class='text-sm text-charcoal-light dark:text-gray-400'>パスキーでログインできるようにします。</p>
      <a href='/settings/passkeys' class='text-sm text-terracotta hover:underline dark:text-terracotta-light'>
        パスキーを管理する
      </a>
    </div>
  </SettingsSection>
);
