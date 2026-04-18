# kosui.me 検索機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pagefind を使ったサイト内全文検索を kosui.me に追加する。Cmd+K で開くクレイモーフィズムデザインのモーダル UI。

**Architecture:** ビルド時に Pagefind がHTML を解析してインデックスを生成。React コンポーネントの SearchModal がモーダルを初回オープン時に Pagefind JS を動的インポートし、デバウンス付きインクリメンタル検索を提供する。BaseLayout.astro にトリガーボタンとモーダルを配置して全ページで利用可能にする。

**Tech Stack:** Astro 5, React 19, Pagefind, Tailwind CSS v4

**Spec:** `apps/kosui-me/docs/superpowers/specs/2026-04-18-search-design.md`

---

## ファイル構成

| 操作   | パス                                              | 責務                                                                    |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Create | `src/components/SearchModal/SearchModal.tsx`      | 検索モーダル本体（入力、結果一覧、キーボード操作）                      |
| Create | `src/components/SearchModal/SearchModal.test.tsx` | SearchModal のユニットテスト                                            |
| Create | `src/components/SearchModal/usePagefind.ts`       | Pagefind の動的インポートとラッパー                                     |
| Modify | `src/layouts/BaseLayout.astro`                    | SearchModal 配置、トリガーボタン追加（デスクトップ・モバイル）          |
| Modify | `src/pages/[...slug].astro`                       | `data-pagefind-body`, `data-pagefind-meta`, `data-pagefind-ignore` 付与 |
| Modify | `src/pages/talks/[year]/[name].astro`             | `data-pagefind-body`, `data-pagefind-meta` 付与                         |
| Modify | `package.json`                                    | `pagefind` devDependency 追加、`postbuild` スクリプト追加               |
| Create | `src/types/pagefind.d.ts`                         | Pagefind API の型定義                                                   |

---

### Task 1: Pagefind の導入とビルドパイプライン構築

**Files:**

- Modify: `apps/kosui-me/package.json`

- [ ] **Step 1: pagefind を devDependencies に追加**

```bash
cd /Users/kosui/ghq/github.com/iwasa-kosui/monorepo/.wt/search-feature
pnpm --filter kosui-me add -D pagefind
```

- [ ] **Step 2: postbuild スクリプトを追加**

`package.json` の `scripts` に追加:

```json
"postbuild": "pagefind --site dist"
```

既存の `build` スクリプト（`astro build && node scripts/build-slidev.mjs`）の後に自動実行される。

- [ ] **Step 3: ビルドを実行して Pagefind がインデックスを生成することを確認**

```bash
cd /Users/kosui/ghq/github.com/iwasa-kosui/monorepo/.wt/search-feature
pnpm --filter kosui-me run build
```

Expected: ビルド完了後に `apps/kosui-me/dist/pagefind/` ディレクトリが生成され、`pagefind.js`、`pagefind-ui.js`、インデックスファイルが存在する。

```bash
ls apps/kosui-me/dist/pagefind/
```

- [ ] **Step 4: コミット**

```bash
git add apps/kosui-me/package.json pnpm-lock.yaml
git commit -m "feat(kosui-me): pagefind を devDependencies に追加し postbuild でインデックス生成"
```

---

### Task 2: ブログ記事ページに Pagefind メタデータを付与

**Files:**

- Modify: `apps/kosui-me/src/pages/[...slug].astro:45`

- [ ] **Step 1: `<article>` に `data-pagefind-body` と `data-pagefind-meta` を付与**

`src/pages/[...slug].astro` の `<article>` タグ（L45）を変更:

```astro
<article
  class="article-paper"
  data-pagefind-body
  data-pagefind-meta={`type:post`}
  {...(isPrivate ? { 'data-pagefind-ignore': 'all' } : {})}
>
```

変更点:

- `data-pagefind-body`: この要素の中身をインデックス対象にする
- `data-pagefind-meta="type:post"`: 検索結果で種類バッジに使う
- `data-pagefind-ignore="all"`: `private: true` の記事をインデックスから除外

- [ ] **Step 2: ビルドしてインデックスにブログ記事が含まれることを確認**

```bash
pnpm --filter kosui-me run build 2>&1 | grep -i pagefind
```

Expected: Pagefind の出力に indexed pages の数が表示され、0 より大きい。

- [ ] **Step 3: コミット**

```bash
git add apps/kosui-me/src/pages/\[...slug\].astro
git commit -m "feat(kosui-me): ブログ記事ページに data-pagefind-body/meta/ignore を付与"
```

---

### Task 3: トークページに Pagefind メタデータを付与

**Files:**

- Modify: `apps/kosui-me/src/pages/talks/[year]/[name].astro`

- [ ] **Step 1: トークページのメインコンテンツ領域に `data-pagefind-body` と `data-pagefind-meta` を付与**

`src/pages/talks/[year]/[name].astro` で、コンテンツ全体を囲む要素を追加する。現在は `<BaseLayout>` 直下に複数の要素が並んでいるため、`<div data-pagefind-body data-pagefind-meta="type:talk">` で囲む。

`<BaseLayout ...>` の直後（`<nav class="mb-6">` の前）に開始タグ、末尾の `</BaseLayout>` の直前に閉じタグを配置:

```astro
<BaseLayout ...>
  <div data-pagefind-body data-pagefind-meta="type:talk">
    <nav class="mb-6">
      <!-- 既存の内容すべて -->
    </nav>
    <!-- ... 以下すべての既存コンテンツ ... -->
  </div>
</BaseLayout>
```

- [ ] **Step 2: ビルドして確認**

```bash
pnpm --filter kosui-me run build 2>&1 | grep -i pagefind
```

Expected: インデックスされたページ数が Task 2 よりも増えている。

- [ ] **Step 3: コミット**

```bash
git add apps/kosui-me/src/pages/talks/\[year\]/\[name\].astro
git commit -m "feat(kosui-me): トークページに data-pagefind-body/meta を付与"
```

---

### Task 4: Pagefind API の型定義を作成

**Files:**

- Create: `apps/kosui-me/src/types/pagefind.d.ts`

- [ ] **Step 1: 型定義ファイルを作成**

```typescript
// src/types/pagefind.d.ts

export interface PagefindSearchResult {
  id: string;
  data: () => Promise<PagefindSearchData>;
}

export interface PagefindSearchData {
  url: string;
  meta: {
    title?: string;
    type?: string;
    [key: string]: string | undefined;
  };
  excerpt: string;
  content: string;
}

export interface PagefindSearchResponse {
  results: PagefindSearchResult[];
}

export interface PagefindInstance {
  search: (query: string) => Promise<PagefindSearchResponse>;
}
```

- [ ] **Step 2: コミット**

```bash
git add apps/kosui-me/src/types/pagefind.d.ts
git commit -m "feat(kosui-me): Pagefind API の型定義を追加"
```

---

### Task 5: usePagefind フックを作成

**Files:**

- Create: `apps/kosui-me/src/components/SearchModal/usePagefind.ts`

- [ ] **Step 1: usePagefind フックを実装**

```typescript
// src/components/SearchModal/usePagefind.ts
import { useCallback, useRef, useState } from 'react';

import type {
  PagefindInstance,
  PagefindSearchData,
} from '../../types/pagefind';

export type SearchResult = {
  url: string;
  title: string;
  excerpt: string;
  type: string;
};

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'results'; results: SearchResult[] }
  | { status: 'no-results' }
  | { status: 'dev-unavailable' };

export function usePagefind() {
  const pagefindRef = useRef<PagefindInstance | null>(null);
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  const loadPagefind = useCallback(
    async (): Promise<PagefindInstance | null> => {
      if (pagefindRef.current) return pagefindRef.current;

      try {
        const pf = await import(
          /* @vite-ignore */ '/pagefind/pagefind.js'
        ) as unknown as PagefindInstance;
        pagefindRef.current = pf;
        return pf;
      } catch {
        setState({ status: 'dev-unavailable' });
        return null;
      }
    },
    [],
  );

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'loading' });

    const pf = await loadPagefind();
    if (!pf) return;

    const response = await pf.search(query);
    const top = response.results.slice(0, 10);
    const dataResults = await Promise.all(top.map((r) => r.data()));

    const results: SearchResult[] = dataResults.map(
      (d: PagefindSearchData) => ({
        url: d.url,
        title: d.meta.title ?? '',
        excerpt: d.excerpt,
        type: d.meta.type ?? 'post',
      }),
    );

    if (results.length === 0) {
      setState({ status: 'no-results' });
    } else {
      setState({ status: 'results', results });
    }
  }, [loadPagefind]);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, search, reset, loadPagefind };
}
```

- [ ] **Step 2: コミット**

```bash
git add apps/kosui-me/src/components/SearchModal/usePagefind.ts
git commit -m "feat(kosui-me): Pagefind 動的インポートと検索ロジックの usePagefind フックを追加"
```

---

### Task 6: SearchModal コンポーネントを作成

**Files:**

- Create: `apps/kosui-me/src/components/SearchModal/SearchModal.tsx`

- [ ] **Step 1: SearchModal コンポーネントを実装**

```tsx
// src/components/SearchModal/SearchModal.tsx
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePagefind } from './usePagefind';

export function SearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { state, search, reset, loadPagefind } = usePagefind();

  const isMac = typeof navigator !== 'undefined'
    && /Mac/.test(navigator.userAgent);

  const open = useCallback(() => {
    setIsOpen(true);
    loadPagefind();
  }, [loadPagefind]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
    reset();
  }, [reset]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeydown);
    return () => document.removeEventListener('keydown', handleGlobalKeydown);
  }, [isOpen, open, close]);

  // Re-register on Astro view transitions
  useEffect(() => {
    function handlePageLoad() {
      // Component is already mounted via client:idle, no re-registration needed
      // But close modal on navigation
      close();
    }
    document.addEventListener('astro:page-load', handlePageLoad);
    return () =>
      document.removeEventListener('astro:page-load', handlePageLoad);
  }, [close]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Debounced search
  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      setActiveIndex(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        search(value);
      }, 300);
    },
    [search],
  );

  const results = state.status === 'results' ? state.results : [];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && results[activeIndex]) {
        window.location.href = results[activeIndex].url;
      }
    },
    [close, results, activeIndex],
  );

  if (!isOpen) {
    return null;
  }

  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className='fixed inset-0 z-50 flex items-start justify-center pt-[15vh]'
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role='presentation'
    >
      {/* Backdrop */}
      <div className='absolute inset-0 bg-charcoal/30 dark:bg-black/50 backdrop-blur-sm' />

      {/* Dialog */}
      <div
        className={`relative w-full max-w-2xl mx-4 bg-card dark:bg-[#1c1c22] rounded-clay shadow-clay-hover dark:shadow-clay-dark-hover overflow-hidden ${
          !prefersReduced ? 'animate-[searchModalIn_0.2s_ease-out]' : ''
        }`}
        role='dialog'
        aria-modal='true'
        aria-label='サイト内検索'
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className='flex items-center gap-3 px-4 py-3 border-b border-border dark:border-[#2a2a32]'>
          <svg
            className='w-5 h-5 text-subtle dark:text-[#9ca3af] shrink-0'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
            />
          </svg>
          <input
            ref={inputRef}
            type='text'
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder='記事やトークを検索...'
            className='flex-1 bg-transparent text-charcoal dark:text-[#ececec] placeholder:text-subtle dark:placeholder:text-[#9ca3af] outline-none text-base'
          />
          <kbd className='hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-subtle dark:text-[#9ca3af] bg-tag-bg dark:bg-[#2a2a32] rounded font-mono'>
            {isMac ? '⌘' : 'Ctrl'}K
          </kbd>
        </div>

        {/* Results */}
        <div className='max-h-[50vh] overflow-y-auto'>
          {state.status === 'loading' && (
            <div className='px-4 py-8 text-center text-subtle dark:text-[#9ca3af] text-sm'>
              検索中...
            </div>
          )}

          {state.status === 'no-results' && (
            <div className='px-4 py-8 text-center text-subtle dark:text-[#9ca3af] text-sm'>
              検索結果が見つかりませんでした
            </div>
          )}

          {state.status === 'dev-unavailable' && (
            <div className='px-4 py-8 text-center text-subtle dark:text-[#9ca3af] text-sm'>
              開発環境では検索を利用できません
            </div>
          )}

          {state.status === 'results'
            && results.map((result, index) => (
              <a
                key={result.url}
                href={result.url}
                className={`block px-4 py-3 border-b border-border/50 dark:border-[#2a2a32]/50 last:border-b-0 transition-colors ${
                  index === activeIndex
                    ? 'bg-accent/5 dark:bg-accent/10'
                    : 'hover:bg-tag-bg dark:hover:bg-[#2a2a32]'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className='flex items-center gap-2 mb-1'>
                  <span className='text-sm font-medium text-charcoal dark:text-[#ececec]'>
                    {result.title}
                  </span>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 text-[10px] rounded-full font-medium ${
                      result.type === 'talk'
                        ? 'bg-accent/10 dark:bg-accent-light/10 text-accent dark:text-accent-light'
                        : 'bg-tag-bg dark:bg-[#2a2a32] text-subtle dark:text-[#9ca3af]'
                    }`}
                  >
                    {result.type === 'talk' ? 'Talk' : 'Post'}
                  </span>
                </div>
                <div
                  className='text-xs text-subtle dark:text-[#9ca3af] line-clamp-2 [&_mark]:bg-accent/20 [&_mark]:text-charcoal dark:[&_mark]:bg-accent/30 dark:[&_mark]:text-[#ececec]'
                  dangerouslySetInnerHTML={{ __html: result.excerpt }}
                />
              </a>
            ))}

          {state.status === 'idle' && query === '' && (
            <div className='px-4 py-6 text-center text-subtle dark:text-[#9ca3af] text-xs'>
              キーワードを入力して検索
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: モーダル表示アニメーションを global.css に追加**

`src/styles/global.css` の `/* ===== Reduced motion ===== */` コメントの直前に追加:

```css
/* ===== Search modal animation ===== */
@keyframes searchModalIn {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

- [ ] **Step 3: コミット**

```bash
git add apps/kosui-me/src/components/SearchModal/SearchModal.tsx apps/kosui-me/src/styles/global.css
git commit -m "feat(kosui-me): クレイモーフィズムデザインの SearchModal コンポーネントを追加"
```

---

### Task 7: BaseLayout.astro にトリガーボタンと SearchModal を配置

**Files:**

- Modify: `apps/kosui-me/src/layouts/BaseLayout.astro`

- [ ] **Step 1: SearchModal をインポートし `client:idle` で配置**

ファイル冒頭のフロントマター内（`---` ブロック内）にインポートを追加:

```astro
import {SearchModal} from '@/components/SearchModal/SearchModal';
```

`</body>` の直前（`</script>` タグの後）に配置:

```astro
<SearchModal client:idle />
```

- [ ] **Step 2: デスクトップヘッダーに検索ボタンを追加**

デスクトップナビ（`<div class="hidden md:flex gap-0.5 sm:gap-1 text-xs sm:text-sm">`）の閉じタグ `</div>` の直後、`</nav>` の直前に追加:

```astro
<button
  type="button"
  class="hidden md:inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-full text-subtle dark:text-[#9ca3af] hover:text-charcoal dark:hover:text-[#ececec] transition-colors"
  aria-label="検索を開く"
  data-search-trigger
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
</button>
```

- [ ] **Step 3: モバイルボトムナビに Search タブを追加**

モバイルナビの `navItems.filter(item => !('external' in item)).map(...)` のループの後、閉じ `</div>` の直前に Search ボタンを追加:

```astro
<button
  type="button"
  class="flex flex-col items-center gap-0.5 py-1 px-3 text-[10px] transition-all text-subtle dark:text-[#9ca3af] active:scale-95"
  aria-label="検索を開く"
  data-search-trigger
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
  <span>Search</span>
</button>
```

- [ ] **Step 4: トリガーボタンのクリックイベントを追加**

既存の `<script>` 内（`document.addEventListener('astro:page-load', () => {` の中）の末尾に追加:

```javascript
document.querySelectorAll('[data-search-trigger]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('open-search'));
  });
});
```

SearchModal 側で、このカスタムイベントを受信して開く処理が必要。SearchModal.tsx の `useEffect`（`handleGlobalKeydown` を登録している箇所）に `open-search` イベントリスナーを追加:

```typescript
// SearchModal.tsx 内、Keyboard shortcut の useEffect と同じ場所に追加
useEffect(() => {
  function handleOpenSearch() {
    open();
  }
  document.addEventListener('open-search', handleOpenSearch);
  return () => document.removeEventListener('open-search', handleOpenSearch);
}, [open]);
```

- [ ] **Step 5: 動作確認**

```bash
pnpm --filter kosui-me run build
```

Expected: ビルド成功。`dist/` 内の HTML にトリガーボタンと SearchModal のハイドレーション用スクリプトが含まれる。

- [ ] **Step 6: コミット**

```bash
git add apps/kosui-me/src/layouts/BaseLayout.astro apps/kosui-me/src/components/SearchModal/SearchModal.tsx
git commit -m "feat(kosui-me): BaseLayout にデスクトップ・モバイル両方の検索トリガーと SearchModal を配置"
```

---

### Task 8: SearchModal のテストを作成

**Files:**

- Create: `apps/kosui-me/src/components/SearchModal/SearchModal.test.tsx`

- [ ] **Step 1: テストファイルを作成**

vitest + React Testing Library（必要なら追加インストール）でテスト。まず依存を確認:

```bash
cd /Users/kosui/ghq/github.com/iwasa-kosui/monorepo/.wt/search-feature
pnpm --filter kosui-me add -D @testing-library/react @testing-library/jest-dom jsdom
```

`vitest.config.ts` に `environment: 'jsdom'` が設定されていることを確認。なければ追加。

```typescript
// src/components/SearchModal/SearchModal.test.tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchModal } from './SearchModal';

// Mock Pagefind (dynamic import will fail in test)
vi.mock('/pagefind/pagefind.js', () => {
  throw new Error('Not available in test');
});

describe('SearchModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<SearchModal />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens on Cmd+K and shows search input', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();

    const input = screen.getByPlaceholderText('記事やトークを検索...');
    expect(input).toBeDefined();
  });

  it('opens on Ctrl+K', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('closes on Escape', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on backdrop click', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog')).toBeDefined();

    // Click the backdrop (the presentation div wrapping dialog)
    const backdrop = screen.getByRole('presentation');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on open-search custom event', () => {
    render(<SearchModal />);

    document.dispatchEvent(new CustomEvent('open-search'));

    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('shows initial hint text when opened with empty query', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(screen.getByText('キーワードを入力して検索')).toBeDefined();
  });
});
```

- [ ] **Step 2: テストを実行**

```bash
pnpm --filter kosui-me run test:ci
```

Expected: 全テストがパス。

- [ ] **Step 3: コミット**

```bash
git add apps/kosui-me/src/components/SearchModal/SearchModal.test.tsx apps/kosui-me/vitest.config.ts apps/kosui-me/package.json pnpm-lock.yaml
git commit -m "test(kosui-me): SearchModal のオープン・クローズ・キーボード操作のテストを追加"
```

---

### Task 9: 型チェック・lint・フォーマットの確認

**Files:** なし（品質チェック）

- [ ] **Step 1: 型チェック**

```bash
pnpm --filter kosui-me tsc --noEmit
```

Expected: エラーなし。Pagefind の動的インポートは `/* @vite-ignore */` で型エラーを回避済み。型定義ファイルがある。

- [ ] **Step 2: lint**

```bash
pnpm --filter kosui-me lint:fix
```

Expected: エラーなし。

- [ ] **Step 3: フォーマット**

```bash
pnpm --filter kosui-me format
```

- [ ] **Step 4: テスト**

```bash
pnpm --filter kosui-me test:ci
```

Expected: 全テストパス。

- [ ] **Step 5: 全体ビルド**

```bash
pnpm --filter '*' build
```

Expected: ビルド成功。

- [ ] **Step 6: lint/format による差分があればコミット**

```bash
git add -u
git diff --cached --quiet || git commit -m "style(kosui-me): lint・フォーマット修正"
```
