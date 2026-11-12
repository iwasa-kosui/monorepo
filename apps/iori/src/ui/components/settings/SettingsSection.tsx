import type { PropsWithChildren } from 'hono/jsx';

type Props = PropsWithChildren<{
  id: string;
  title: string;
}>;

export const SettingsSection = ({ id, title, children }: Props) => (
  <section id={id} class='mb-8 scroll-mt-8'>
    <h2 class='text-lg font-semibold text-charcoal dark:text-white mb-4'>{title}</h2>
    {children}
  </section>
);
