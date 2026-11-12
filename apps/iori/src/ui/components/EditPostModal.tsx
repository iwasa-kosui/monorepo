import type { Status } from '../../adaptor/mastodon/entities.ts';
import { canSendEdit, type EditLoadState, hasEditableImages } from '../hooks/editDialog.ts';
import { blueskyEditNotice } from './blueskyCrosspostMark.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { ReplyDialogShell } from './ReplyDialogShell.tsx';

export const EDIT_UNCHANGEABLE_NOTICE = '画像・引用先・公開範囲・送り先は変えられません';

type Props = Readonly<{
  target: Status;
  loadState: EditLoadState;
  content: string;
  cw: string;
  sensitive: boolean;
  isSending: boolean;
  errorText: string | undefined;
  onClose: () => void;
  onSubmit: () => void;
  onContentChange: (content: string) => void;
  onCwChange: (cw: string) => void;
  onSensitiveChange: (sensitive: boolean) => void;
}>;

export const EditPostModal = ({
  target,
  loadState,
  content,
  cw,
  sensitive,
  isSending,
  errorText,
  onClose,
  onSubmit,
  onContentChange,
  onCwChange,
  onSensitiveChange,
}: Props) => {
  const hasImages = hasEditableImages(target);
  const canSubmit = canSendEdit(content, hasImages, loadState, isSending);
  const hasCw = cw.trim() !== '';
  const blueskyNotice = blueskyEditNotice(target);

  return (
    <ReplyDialogShell
      title='投稿を編集'
      submitLabel='保存'
      onClose={onClose}
      onSubmit={() => {
        if (canSubmit) onSubmit();
      }}
      isSending={isSending}
      canSubmit={canSubmit}
      errorText={errorText}
    >
      {loadState === 'loading'
        ? <p role='status' class='py-6 text-sm text-charcoal-light dark:text-gray-400'>読み込み中...</p>
        : loadState === 'failed'
        ? null
        : (
          <>
            <input
              type='text'
              name='spoiler_text'
              value={cw}
              onInput={(e) => onCwChange((e.target as HTMLInputElement).value)}
              placeholder='注意書き（CW）'
              aria-label='注意書き（CW）'
              disabled={isSending}
              class='mb-2 w-full px-4 py-2 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset'
            />
            <MarkdownEditor
              value={content}
              onChange={onContentChange}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (canSubmit) onSubmit();
                }
              }}
              placeholder='投稿を書き直す... (⌘+Enter to save)'
              minHeight='150px'
              disabled={isSending}
            />
            {hasImages && (
              <label class='mt-2 flex items-center gap-1 text-xs text-charcoal-light dark:text-gray-400 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={sensitive || hasCw}
                  disabled={hasCw || isSending}
                  onChange={(e) => onSensitiveChange((e.target as HTMLInputElement).checked)}
                />
                画像をセンシティブにする
              </label>
            )}
            <p class='mt-2 text-xs text-charcoal-light dark:text-gray-400'>{EDIT_UNCHANGEABLE_NOTICE}</p>
            {blueskyNotice !== undefined && (
              <p role='note' class='mt-1 text-xs text-charcoal-light dark:text-gray-400'>{blueskyNotice}</p>
            )}
          </>
        )}
    </ReplyDialogShell>
  );
};
