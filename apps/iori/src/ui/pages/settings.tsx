import { useEffect } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import { SettingsView } from '../components/settings/SettingsView.tsx';
import { useIsXOwner } from '../hooks/useIsXOwner.ts';

const SettingsPage = () => {
  const isXOwner = useIsXOwner();

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id !== '') document.getElementById(id)?.scrollIntoView();
  }, [isXOwner]);

  return <SettingsView isXOwner={isXOwner} />;
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<SettingsPage />, root);
}
