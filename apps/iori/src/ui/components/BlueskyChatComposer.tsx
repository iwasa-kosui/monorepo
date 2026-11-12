import { remainingGraphemes, shouldSendOnKey } from '../hooks/blueskyChat.ts';

type Props = Readonly<{
  text: string;
  isSending: boolean;
  canSend: boolean;
  error: string | null;
  onChange: (text: string) => void;
  onSend: () => void;
}>;

export const BlueskyChatComposer = ({ text, isSending, canSend, error, onChange, onSend }: Props) => {
  const remaining = remainingGraphemes(text);
  return (
    <form
      class='mt-4 space-y-2'
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      {error !== null && <p role='alert' class='text-sm text-red-600 dark:text-red-400'>{error}</p>}
      <textarea
        value={text}
        aria-label='メッセージ'
        placeholder='メッセージを入力'
        rows={3}
        readOnly={isSending}
        onInput={(event) => onChange((event.target as HTMLTextAreaElement).value)}
        onKeyDown={(event) => {
          const isComposing = event.isComposing || event.keyCode === 229;
          if (shouldSendOnKey({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, isComposing })) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        class='w-full px-4 py-3 rounded-clay bg-warm-gray dark:bg-gray-700 text-charcoal dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-terracotta/30 border border-warm-gray-dark dark:border-gray-600 shadow-clay-inset resize-none transition-all'
      />
      <div class='flex items-center justify-between gap-3'>
        <span
          data-testid='bluesky-chat-remaining'
          class={`text-sm ${
            remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-charcoal-light dark:text-gray-400'
          }`}
        >
          {remaining}
        </span>
        <button
          type='submit'
          disabled={!canSend}
          class='px-4 py-2 rounded-xl bg-terracotta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50'
        >
          {isSending ? '送信中' : '送信'}
        </button>
      </div>
    </form>
  );
};
