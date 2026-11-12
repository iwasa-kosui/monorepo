import type { BlueskyCrosspostKind } from './blueskyCrosspostMark.ts';

const strokePaths: Readonly<Record<BlueskyCrosspostKind, string>> = {
  pending: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  retrying:
    'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
  failed:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  skipped: 'M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636',
};

export const BlueskyCrosspostIcon = ({ kind }: { kind: BlueskyCrosspostKind }) => (
  <span class='relative inline-block h-5 w-5'>
    <svg
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden='true'
      class='h-5 w-5'
      viewBox='0 0 24 24'
      fill='currentColor'
    >
      <path d='M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z' />
    </svg>
    <span class='absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-cream dark:bg-gray-800'>
      <svg
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden='true'
        class='h-2.5 w-2.5'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='3'
      >
        <path stroke-linecap='round' stroke-linejoin='round' d={strokePaths[kind]} />
      </svg>
    </span>
  </span>
);
