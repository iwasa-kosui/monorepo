import type { Child, PropsWithChildren } from 'hono/jsx';

type Props = PropsWithChildren<{
  id: string;
  actions?: Child;
  showCloseButton?: boolean;
}>;

export const Modal = ({
  id,
  children,
  actions,
  showCloseButton = true,
}: PropsWithChildren<Props>) => (
  <div class='hidden target:block' id={id}>
    {/* Backdrop - clicking closes the modal */}
    <a
      href='#'
      class='w-full h-full bg-black/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
      aria-label='Close modal'
    />
    {/* Modal content - positioned on top of backdrop */}
    <div class='fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'>
      <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 w-full max-w-md relative pointer-events-auto'>
        {children}
        {(showCloseButton || actions) && (
          <div class='flex mt-3 gap-2 justify-end'>
            {showCloseButton && (
              <a href='#'>
                <button class='px-4 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors'>
                  Close
                </button>
              </a>
            )}
            {actions}
          </div>
        )}
      </div>
    </div>
  </div>
);
