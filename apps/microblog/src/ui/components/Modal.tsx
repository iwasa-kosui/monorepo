import type { Child, PropsWithChildren } from 'hono/jsx';

type Props = PropsWithChildren<{
  id: string;
  actions?: Child;
  showCloseButton?: boolean;
  contentClass?: string;
  /** モバイルで全画面表示にする（PCではmax-width適用） */
  fullScreen?: boolean;
}>;

export const Modal = ({
  id,
  children,
  actions,
  showCloseButton = true,
  contentClass,
  fullScreen = false,
}: PropsWithChildren<Props>) => (
  <div class='hidden target:block' id={id}>
    {/* Backdrop - clicking closes the modal */}
    <a
      href='#'
      class='w-full h-full bg-charcoal/50 backdrop-blur-sm fixed inset-0 z-50 cursor-default'
      aria-label='Close modal'
    />
    {/* Modal content - positioned on top of backdrop */}
    <div
      class={fullScreen
        ? 'fixed inset-0 z-50 flex items-center justify-center pointer-events-none md:p-4'
        : 'fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'}
    >
      <div
        class={fullScreen
          ? `bg-cream dark:bg-gray-800 md:rounded-clay shadow-clay dark:shadow-clay-dark p-4 md:p-6 relative pointer-events-auto w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl flex flex-col ${
            contentClass ?? ''
          }`
          : contentClass
          ? `bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 relative pointer-events-auto ${contentClass}`
          : 'bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-6 w-full max-w-md relative pointer-events-auto'}
      >
        {children}
        {(showCloseButton || actions) && (
          <div class='flex mt-3 gap-2 justify-end'>
            {showCloseButton && (
              <a href='#'>
                <button class='px-4 py-1.5 text-charcoal-light dark:text-gray-400 hover:text-charcoal dark:hover:text-gray-200 text-sm transition-colors'>
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
