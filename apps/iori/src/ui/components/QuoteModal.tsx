import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';
import { canSendQuote } from '../hooks/quoteDialog.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { PostDestinationSelect } from './PostDestinationSelect.tsx';
import { QuotedPostCard } from './QuotedPostCard.tsx';
import { ReplyDialogShell } from './ReplyDialogShell.tsx';

type Props = Readonly<{
  target: Status;
  content: string;
  destination: PostDestination;
  isSending: boolean;
  errorText: string | undefined;
  onClose: () => void;
  onSubmit: () => void;
  onContentChange: (content: string) => void;
  onDestinationChange: (destination: PostDestination) => void;
}>;

export const QuoteModal = ({
  target,
  content,
  destination,
  isSending,
  errorText,
  onClose,
  onSubmit,
  onContentChange,
  onDestinationChange,
}: Props) => {
  const canSubmit = canSendQuote(content, isSending);

  return (
    <ReplyDialogShell
      title='引用'
      submitLabel='引用して投稿'
      onClose={onClose}
      onSubmit={() => {
        if (canSubmit) onSubmit();
      }}
      isSending={isSending}
      canSubmit={canSubmit}
      errorText={errorText}
      target={
        <div class='mb-3'>
          <QuotedPostCard quote={{ kind: 'card', status: target }} />
        </div>
      }
      leadingActions={
        <PostDestinationSelect
          value={destination}
          onChange={onDestinationChange}
          name='quote-destination'
          disabled={isSending}
        />
      }
    >
      <MarkdownEditor
        value={content}
        onChange={onContentChange}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (canSubmit) onSubmit();
          }
        }}
        placeholder='引用にコメントを書く... (⌘+Enter to post)'
        minHeight='150px'
        disabled={isSending}
      />
    </ReplyDialogShell>
  );
};
