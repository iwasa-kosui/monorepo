import { useEffect, useRef, useState } from 'hono/jsx';

import type { Account } from '../../adaptor/mastodon/entities.ts';
import { searchMentionCandidates } from '../api/mastodonClient.ts';
import { accountHandle } from '../api/status.ts';
import {
  insertMention,
  MENTION_LIST_GAP_PX,
  mentionListPlacement,
  type MentionListSide,
  type MentionToken,
  mentionTokenAt,
} from '../components/mentionSuggestion.ts';
import { caretLineOffset } from '../components/textareaCaret.ts';

const SEARCH_DELAY_MS = 150;
const LIST_HEIGHT_PX = 256;

/** 候補の一覧の置き場所。`offset` は、下に開くなら一覧の上端、上に開くなら一覧の下端の、textarea の上端からの距離。 */
export type MentionListPosition = Readonly<{ side: MentionListSide; offset: number; maxHeight: number }>;

const fallbackPosition: MentionListPosition = { side: 'below', offset: 0, maxHeight: LIST_HEIGHT_PX };

// スマホではキーボードが出ても window.innerHeight は縮まないので、見えている範囲は visualViewport から取る
const visibleRange = (): Readonly<{ top: number; bottom: number }> => {
  const viewport = window.visualViewport;
  return viewport === null || viewport === undefined
    ? { top: 0, bottom: window.innerHeight }
    : { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height };
};

const positionAtCaret = (textarea: HTMLTextAreaElement, caret: number): MentionListPosition => {
  const line = caretLineOffset(textarea, caret);
  const rect = textarea.getBoundingClientRect();
  const range = visibleRange();
  const { side, maxHeight } = mentionListPlacement({
    caretTop: rect.top + line.top,
    caretBottom: rect.top + line.bottom,
    viewportTop: range.top,
    viewportBottom: range.bottom,
    preferredHeight: LIST_HEIGHT_PX,
  });
  const offset = side === 'below' ? line.bottom + MENTION_LIST_GAP_PX : line.top - MENTION_LIST_GAP_PX;
  return { side, offset: textarea.offsetTop + offset, maxHeight };
};

type Options = Readonly<{
  value: string;
  onChange: (value: string) => void;
}>;

/**
 * textarea で `@` に続けて書きかけた宛先から、メンションの候補を探して選ばせる。
 * 返す `handleKeyDown` が true を返したキー入力は候補の操作に使ったので、呼び出し側では扱わない。
 */
export const useMentionSuggestions = ({ value, onChange }: Options) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [token, setToken] = useState<MentionToken | undefined>(undefined);
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MentionListPosition>(fallbackPosition);
  const pendingCaret = useRef<number | null>(null);
  // 入力のたびに検索しないよう少し待ち、古い問い合わせの結果は捨てる
  const [pending] = useState<{ timer: ReturnType<typeof setTimeout> | null; seq: number; query: string | undefined }>(
    () => ({ timer: null, seq: 0, query: undefined }),
  );

  const cancelSearch = () => {
    pending.query = undefined;
    pending.seq += 1;
    if (pending.timer !== null) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
  };

  const search = (query: string) => {
    cancelSearch();
    pending.query = query;
    const seq = pending.seq;
    pending.timer = setTimeout(() => {
      pending.timer = null;
      searchMentionCandidates(query)
        .then((found) => {
          if (seq !== pending.seq) return;
          setAccounts(found);
          setActiveIndex(0);
        })
        .catch(() => {
          if (seq === pending.seq) setAccounts([]);
        });
    }, SEARCH_DELAY_MS);
  };

  useEffect(() => cancelSearch, []);

  // 候補を選んだあと、値が描画に反映されてからキャレットを宛先の後ろへ動かす
  useEffect(() => {
    const caret = pendingCaret.current;
    const textarea = textareaRef.current;
    if (caret === null || textarea === null) return;
    pendingCaret.current = null;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  }, [value]);

  const close = () => {
    cancelSearch();
    setToken(undefined);
    setAccounts([]);
  };

  const refresh = (textarea: HTMLTextAreaElement) => {
    if (textarea.selectionStart !== textarea.selectionEnd) {
      close();
      return;
    }
    const next = mentionTokenAt(textarea.value, textarea.selectionStart);
    if (next === undefined) {
      close();
      return;
    }
    if (next.query !== pending.query) {
      search(next.query);
    }
    setToken(next);
    setPosition(positionAtCaret(textarea, next.end));
  };

  const select = (account: Account) => {
    if (token === undefined) return;
    const inserted = insertMention(value, token, accountHandle(account));
    pendingCaret.current = inserted.caret;
    close();
    onChange(inserted.text);
  };

  const isOpen = token !== undefined && accounts.length > 0;

  const handleKeyDown = (e: KeyboardEvent): boolean => {
    // 日本語の変換を確定する Enter を、候補の選択と取り違えない
    if (!isOpen || e.isComposing) return false;
    switch (e.key) {
      case 'ArrowDown':
        setActiveIndex((activeIndex + 1) % accounts.length);
        break;
      case 'ArrowUp':
        setActiveIndex((activeIndex - 1 + accounts.length) % accounts.length);
        break;
      case 'Enter':
      case 'Tab': {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
        const account = accounts[activeIndex];
        if (account === undefined) return false;
        select(account);
        break;
      }
      case 'Escape':
        close();
        break;
      default:
        return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  };

  return {
    textareaRef,
    isOpen,
    accounts,
    activeIndex,
    position,
    refresh,
    close,
    select,
    setActiveIndex,
    handleKeyDown,
  };
};
