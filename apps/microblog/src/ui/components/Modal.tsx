import type { Child, PropsWithChildren } from "hono/jsx";

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
  <div class="hidden target:block" id={id}>
    <div class="w-full h-full bg-black/80 fixed top-0 left-0">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 m-8 max-w-md mx-auto">
        {children}
        <div class="flex mt-4 gap-2 justify-end">
          <a href="#" class="text-blue-500 hover:underline">
            {showCloseButton && (
              <button class="mt-4 px-4 py-2 text-white rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors">
                Close
              </button>
            )}
          </a>
          {actions}
        </div>
      </div>
    </div>
  </div>
);
