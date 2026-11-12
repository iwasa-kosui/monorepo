import { render } from 'hono/jsx/dom';

import { BlueskyCredentialSection } from '../components/BlueskyCredentialSection.tsx';

const BlueskyCredentialPage = () => (
  <section class='mb-8'>
    <BlueskyCredentialSection />
  </section>
);

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<BlueskyCredentialPage />, root);
}
