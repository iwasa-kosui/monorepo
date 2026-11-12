import { useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import { SettingsView } from '../components/settings/SettingsView.tsx';
import { useIsXOwner } from '../hooks/useIsXOwner.ts';

const SettingsPage = () => {
  const { isOwner, isResolved } = useIsXOwner();
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const hasScrolled = useRef(false);

  useEffect(() => {
    if (hasScrolled.current || !isResolved || !isProfileLoaded) return;
    hasScrolled.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id !== '') document.getElementById(id)?.scrollIntoView();
  }, [isResolved, isProfileLoaded]);

  return <SettingsView isXOwner={isOwner} onProfileLoaded={() => setIsProfileLoaded(true)} />;
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<SettingsPage />, root);
}
