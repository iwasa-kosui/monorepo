# ADR-001: タイムライン画面の状態管理アーキテクチャ

## ステータス

提案中（Proposed）

## 日付

2026-01-21

## コンテキスト

### 現状の問題

タイムライン画面（`src/ui/pages/home.tsx`）では、以下の問題が発生している：

| 問題                                            | 深刻度 | 詳細                                           |
| ----------------------------------------------- | ------ | ---------------------------------------------- |
| 19個のuseStateが単一コンポーネントに集中        | 🔴🔴🔴 | `home.tsx` L840-876                            |
| 59個のpropsがHomePageにドリリング               | 🔴🔴   | `home.tsx` L18-59                              |
| モーダル状態の断片化                            | 🔴     | threadModalPostId, threadData, isLoadingThread |
| イベントリスナー管理の重複                      | 🟠     | 3つのuseEffectで個別管理                       |
| 無限スクロール処理の3ファイル重複               | 🟠     | home.tsx, localUser.tsx, remoteUser.tsx        |
| useCallback/useMemo未使用による不要な再レンダー | 🟠     | 全handlersが毎回再定義                         |

### 現在の状態カテゴリ

```
1. サーバー状態（Server State）
   - data（タイムラインアイテム + ユーザー情報）
   - threadData（スレッド詳細）

2. アクション状態（Mutation State）
   - likingPostId, undoingLikePostId
   - repostingPostId, undoingRepostPostId
   - deletingPostId, emojiReactingPostId
   - isSendingReply, isRefreshing, isLoadingThread

3. UI状態（UI State）
   - selectedIndex（キーボードナビゲーション）
   - emojiPickerOpenForIndex（絵文字ピッカー）
   - replyingToPostId, replyContent（返信ダイアログ）
   - threadModalPostId（スレッドモーダル）

4. ユーザー固有状態（User-specific State）
   - myReactions（Map<投稿ID, 絵文字[]>）
```

### 使用されていない技術

- Context API
- useReducer
- Custom Hooks（状態ロジック抽出）
- useMemo / useCallback
- TanStack Query / SWR

---

## 決定

**選択肢は4つ提案する。チームで議論の上、最適なものを選択する。**

---

## 選択肢1: Custom Hooks + Context パターン（推奨）

### 概要

関連する状態をカスタムフックに抽出し、必要に応じてContextで共有する。

### アーキテクチャ

```
src/ui/
├── contexts/
│   └── TimelineContext.tsx      # タイムライン全体のContext
├── hooks/
│   ├── useTimeline.ts           # タイムラインデータ管理
│   ├── usePostActions.ts        # いいね/リポスト/削除アクション
│   ├── useKeyboardNavigation.ts # キーボード操作
│   ├── usePullToRefresh.ts      # プルトゥリフレッシュ
│   ├── useInfiniteScroll.ts     # 無限スクロール
│   ├── useThreadModal.ts        # スレッドモーダル状態
│   └── useReplyDialog.ts        # 返信ダイアログ状態
└── pages/
    └── home.tsx                 # シンプルなコンポーネント構成
```

### 実装例

```typescript
// hooks/useTimeline.ts
type TimelineState = Readonly<{
  items: ReadonlyArray<TimelineItemWithPost>;
  isLoading: boolean;
  error: Error | null;
}>;

export const useTimeline = () => {
  const [state, setState] = useState<TimelineState>({
    items: [],
    isLoading: true,
    error: null,
  });

  const fetchMore = useCallback(async (cursor?: Instant) => {
    // fetch logic
  }, []);

  const refresh = useCallback(async () => {
    // refresh logic
  }, []);

  const updatePost = useCallback(
    (postId: string, updater: (post: Post) => Post) => {
      setState(prev => ({
        ...prev,
        items: prev.items.map(item =>
          item.post.postId === postId
            ? { ...item, post: updater(item.post) }
            : item
        ),
      }));
    },
    [],
  );

  return { ...state, fetchMore, refresh, updatePost } as const;
};
```

```typescript
// hooks/usePostActions.ts
type ActionState = Readonly<{
  likingPostId: string | null;
  undoingLikePostId: string | null;
  repostingPostId: string | null;
  undoingRepostPostId: string | null;
  deletingPostId: string | null;
  emojiReactingPostId: string | null;
}>;

export const usePostActions = (
  updatePost: (postId: string, updater: (p: Post) => Post) => void,
) => {
  const [state, setState] = useState<ActionState>({
    likingPostId: null,
    undoingLikePostId: null,
    repostingPostId: null,
    undoingRepostPostId: null,
    deletingPostId: null,
    emojiReactingPostId: null,
  });

  const like = useCallback(async (postId: string) => {
    setState(prev => ({ ...prev, likingPostId: postId }));
    try {
      await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
      updatePost(postId, post => ({ ...post, liked: true }));
    } finally {
      setState(prev => ({ ...prev, likingPostId: null }));
    }
  }, [updatePost]);

  // ... other actions

  return { ...state, like, undoLike, repost, undoRepost, deletePost } as const;
};
```

```typescript
// contexts/TimelineContext.tsx
type TimelineContextValue = Readonly<{
  timeline: ReturnType<typeof useTimeline>;
  actions: ReturnType<typeof usePostActions>;
  keyboard: ReturnType<typeof useKeyboardNavigation>;
}>;

const TimelineContext = createContext<TimelineContextValue | null>(null);

export const TimelineProvider: FC<PropsWithChildren> = ({ children }) => {
  const timeline = useTimeline();
  const actions = usePostActions(timeline.updatePost);
  const keyboard = useKeyboardNavigation(timeline.items);

  const value = useMemo(() => ({
    timeline,
    actions,
    keyboard,
  }), [timeline, actions, keyboard]);

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
};

export const useTimelineContext = () => {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error('useTimelineContext must be used within TimelineProvider');
  }
  return ctx;
};
```

```typescript
// pages/home.tsx（リファクタリング後）
const HomePage: FC = () => {
  const { timeline, actions, keyboard } = useTimelineContext();

  return (
    <div>
      <PostForm />
      <TimelineList
        items={timeline.items}
        selectedIndex={keyboard.selectedIndex}
        onLike={actions.like}
        likingPostId={actions.likingPostId}
      />
      <ThreadModal />
      <ReplyDialog />
    </div>
  );
};

export const App: FC = () => (
  <TimelineProvider>
    <HomePage />
  </TimelineProvider>
);
```

### メリット

- **追加ライブラリ不要**: React標準機能のみ
- **段階的移行可能**: 既存コードを少しずつリファクタリング
- **テスト容易**: 各hookを個別にテスト可能
- **学習コスト低**: React開発者なら馴染みやすい
- **型安全**: TypeScriptとの相性が良い

### デメリット

- **サーバー状態管理が手動**: キャッシュ、楽観的更新、エラーリトライを自前実装
- **Context地獄のリスク**: 分割が細かすぎると管理困難
- **メモ化の責任**: useMemo/useCallbackを適切に使う必要あり

### 移行コスト

低〜中（2-3週間）

---

## 選択肢2: TanStack Query + Zustand パターン

### 概要

サーバー状態はTanStack Query、クライアント状態はZustandで分離管理する。

### アーキテクチャ

```
src/ui/
├── queries/
│   ├── useTimelineQuery.ts      # タイムライン取得
│   ├── useThreadQuery.ts        # スレッド詳細取得
│   └── mutations/
│       ├── useLikeMutation.ts   # いいねmutation
│       ├── useRepostMutation.ts # リポストmutation
│       └── useDeleteMutation.ts # 削除mutation
├── stores/
│   ├── uiStore.ts               # UI状態（selectedIndex, modals）
│   └── userStore.ts             # ユーザー固有状態（myReactions）
└── pages/
    └── home.tsx
```

### 実装例

```typescript
// queries/useTimelineQuery.ts
export const useTimelineQuery = () => {
  return useInfiniteQuery({
    queryKey: ['timeline'],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(`/api/timeline?cursor=${pageParam ?? ''}`);
      return res.json() as Promise<TimelineResponse>;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 1000 * 60, // 1分
  });
};
```

```typescript
// queries/mutations/useLikeMutation.ts
export const useLikeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
      return res.json();
    },
    // 楽観的更新
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: ['timeline'] });
      const previous = queryClient.getQueryData(['timeline']);

      queryClient.setQueryData(['timeline'], (old: TimelineData) => ({
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          items: page.items.map(item =>
            item.post.postId === postId
              ? { ...item, post: { ...item.post, liked: true } }
              : item
          ),
        })),
      }));

      return { previous };
    },
    onError: (_err, _postId, context) => {
      queryClient.setQueryData(['timeline'], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};
```

```typescript
// stores/uiStore.ts
type UIState = Readonly<{
  selectedIndex: number;
  emojiPickerOpenForIndex: number | null;
  replyingToPostId: string | null;
  replyContent: string;
  threadModalPostId: string | null;
}>;

type UIActions = Readonly<{
  setSelectedIndex: (index: number) => void;
  openEmojiPicker: (index: number) => void;
  closeEmojiPicker: () => void;
  openReplyDialog: (postId: string) => void;
  closeReplyDialog: () => void;
  setReplyContent: (content: string) => void;
  openThreadModal: (postId: string) => void;
  closeThreadModal: () => void;
}>;

export const useUIStore = create<UIState & UIActions>((set) => ({
  selectedIndex: -1,
  emojiPickerOpenForIndex: null,
  replyingToPostId: null,
  replyContent: '',
  threadModalPostId: null,

  setSelectedIndex: (index) => set({ selectedIndex: index }),
  openEmojiPicker: (index) => set({ emojiPickerOpenForIndex: index }),
  closeEmojiPicker: () => set({ emojiPickerOpenForIndex: null }),
  openReplyDialog: (postId) =>
    set({ replyingToPostId: postId, replyContent: '' }),
  closeReplyDialog: () => set({ replyingToPostId: null, replyContent: '' }),
  setReplyContent: (content) => set({ replyContent: content }),
  openThreadModal: (postId) => set({ threadModalPostId: postId }),
  closeThreadModal: () => set({ threadModalPostId: null }),
}));
```

```typescript
// pages/home.tsx
const HomePage: FC = () => {
  const { data, fetchNextPage, isLoading, isFetchingNextPage } =
    useTimelineQuery();
  const { mutate: like, isPending: isLiking } = useLikeMutation();
  const { selectedIndex, setSelectedIndex } = useUIStore();

  // 無限スクロール
  useInfiniteScroll({
    onLoadMore: fetchNextPage,
    isLoading: isFetchingNextPage,
  });

  // キーボードナビゲーション
  useKeyboardNavigation({
    items: data?.pages.flatMap(p => p.items) ?? [],
    selectedIndex,
    onSelect: setSelectedIndex,
    onLike: like,
  });

  const items = data?.pages.flatMap(p => p.items) ?? [];

  return (
    <div>
      <PostForm />
      <TimelineList items={items} selectedIndex={selectedIndex} />
      <ThreadModal />
      <ReplyDialog />
    </div>
  );
};
```

### メリット

- **サーバー状態の自動管理**: キャッシュ、リフェッチ、エラーリトライが組み込み
- **楽観的更新が容易**: onMutateで即座にUI更新
- **DevTools充実**: TanStack Query DevToolsで状態可視化
- **無限スクロール対応**: useInfiniteQueryで簡単実装
- **状態の明確な分離**: サーバー状態とクライアント状態が分離

### デメリット

- **ライブラリ追加**: tanstack/react-query + zustand
- **学習コスト**: TanStack Queryのコンセプト理解が必要
- **バンドルサイズ増加**: 約15KB (gzip)
- **既存APIとの統合**: 現在のfetch処理を書き換え必要

### 移行コスト

中〜高（3-4週間）

---

## 選択肢3: useReducer + Context パターン

### 概要

関連する状態をReducerに集約し、Contextで共有する。Fluxパターンに近い設計。

### アーキテクチャ

```
src/ui/
├── reducers/
│   ├── timelineReducer.ts       # タイムライン状態管理
│   ├── uiReducer.ts             # UI状態管理
│   └── types.ts                 # Action型定義
├── contexts/
│   ├── TimelineContext.tsx      # タイムライン状態Provider
│   └── UIContext.tsx            # UI状態Provider
└── pages/
    └── home.tsx
```

### 実装例

```typescript
// reducers/types.ts
type TimelineAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: TimelineItemWithPost[] }
  | { type: 'FETCH_ERROR'; payload: Error }
  | { type: 'APPEND_ITEMS'; payload: TimelineItemWithPost[] }
  | {
    type: 'UPDATE_POST';
    payload: { postId: string; updater: (p: Post) => Post };
  }
  | { type: 'REMOVE_POST'; payload: string };

type UIAction =
  | { type: 'SET_SELECTED_INDEX'; payload: number }
  | { type: 'OPEN_EMOJI_PICKER'; payload: number }
  | { type: 'CLOSE_EMOJI_PICKER' }
  | { type: 'OPEN_REPLY_DIALOG'; payload: string }
  | { type: 'CLOSE_REPLY_DIALOG' }
  | { type: 'SET_REPLY_CONTENT'; payload: string }
  | { type: 'OPEN_THREAD_MODAL'; payload: string }
  | { type: 'CLOSE_THREAD_MODAL' }
  | { type: 'SET_THREAD_DATA'; payload: ThreadData | null }
  | { type: 'SET_THREAD_LOADING'; payload: boolean };
```

```typescript
// reducers/timelineReducer.ts
type TimelineState = Readonly<{
  items: ReadonlyArray<TimelineItemWithPost>;
  isLoading: boolean;
  error: Error | null;
}>;

const initialState: TimelineState = {
  items: [],
  isLoading: true,
  error: null,
};

export const timelineReducer = (
  state: TimelineState,
  action: TimelineAction,
): TimelineState => {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, isLoading: true, error: null };

    case 'FETCH_SUCCESS':
      return { ...state, items: action.payload, isLoading: false };

    case 'FETCH_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'APPEND_ITEMS':
      return { ...state, items: [...state.items, ...action.payload] };

    case 'UPDATE_POST':
      return {
        ...state,
        items: state.items.map(item =>
          item.post.postId === action.payload.postId
            ? { ...item, post: action.payload.updater(item.post) }
            : item
        ),
      };

    case 'REMOVE_POST':
      return {
        ...state,
        items: state.items.filter(item => item.post.postId !== action.payload),
      };

    default:
      return state;
  }
};
```

```typescript
// reducers/uiReducer.ts
type UIState = Readonly<{
  selectedIndex: number;
  emojiPickerOpenForIndex: number | null;
  replyingToPostId: string | null;
  replyContent: string;
  threadModalPostId: string | null;
  threadData: ThreadData | null;
  isLoadingThread: boolean;
}>;

const initialUIState: UIState = {
  selectedIndex: -1,
  emojiPickerOpenForIndex: null,
  replyingToPostId: null,
  replyContent: '',
  threadModalPostId: null,
  threadData: null,
  isLoadingThread: false,
};

export const uiReducer = (state: UIState, action: UIAction): UIState => {
  switch (action.type) {
    case 'SET_SELECTED_INDEX':
      return { ...state, selectedIndex: action.payload };

    case 'OPEN_EMOJI_PICKER':
      return { ...state, emojiPickerOpenForIndex: action.payload };

    case 'CLOSE_EMOJI_PICKER':
      return { ...state, emojiPickerOpenForIndex: null };

    case 'OPEN_REPLY_DIALOG':
      return { ...state, replyingToPostId: action.payload, replyContent: '' };

    case 'CLOSE_REPLY_DIALOG':
      return { ...state, replyingToPostId: null, replyContent: '' };

    case 'SET_REPLY_CONTENT':
      return { ...state, replyContent: action.payload };

    case 'OPEN_THREAD_MODAL':
      return {
        ...state,
        threadModalPostId: action.payload,
        threadData: null,
        isLoadingThread: true,
      };

    case 'CLOSE_THREAD_MODAL':
      return {
        ...state,
        threadModalPostId: null,
        threadData: null,
        isLoadingThread: false,
      };

    case 'SET_THREAD_DATA':
      return { ...state, threadData: action.payload, isLoadingThread: false };

    case 'SET_THREAD_LOADING':
      return { ...state, isLoadingThread: action.payload };

    default:
      return state;
  }
};
```

```typescript
// contexts/TimelineContext.tsx
type TimelineContextValue = Readonly<{
  state: TimelineState;
  dispatch: Dispatch<TimelineAction>;
}>;

const TimelineContext = createContext<TimelineContextValue | null>(null);

export const TimelineProvider: FC<PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(timelineReducer, initialState);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
};
```

### メリット

- **追加ライブラリ不要**: React標準機能のみ
- **状態遷移が明確**: Actionで状態変更を追跡可能
- **デバッグ容易**: Redux DevToolsに近い体験（useDebugValue等で）
- **予測可能な状態更新**: 純粋関数のReducer
- **テスト容易**: Reducerは純粋関数なのでテストしやすい

### デメリット

- **ボイラープレート多い**: Action型定義、Reducer定義が必要
- **非同期処理が煩雑**: 副作用の扱いに追加パターンが必要（ミドルウェア的なもの）
- **過度な構造化リスク**: シンプルな状態にも同じパターンを強制
- **Context分割が必要**: 状態ごとにContextを分けないと不要な再レンダー

### 移行コスト

中（2-3週間）

---

## 選択肢4: Jotai パターン

### 概要

原子的（Atomic）な状態管理で、必要な状態のみを購読する細粒度のリアクティビティを実現。

### アーキテクチャ

```
src/ui/
├── atoms/
│   ├── timeline.ts              # タイムライン関連atom
│   ├── ui.ts                    # UI状態atom
│   ├── thread.ts                # スレッドモーダルatom
│   └── actions.ts               # アクション状態atom
└── pages/
    └── home.tsx
```

### 実装例

```typescript
// atoms/timeline.ts
import { atom } from 'jotai';
import { atomWithQuery } from 'jotai-tanstack-query';

// 基本のタイムラインatom
export const timelineItemsAtom = atom<ReadonlyArray<TimelineItemWithPost>>([]);

// 派生atom: 投稿IDでフィルタ
export const postByIdAtom = atom((get) => {
  const items = get(timelineItemsAtom);
  return (postId: string) => items.find(item => item.post.postId === postId);
});

// 非同期atom（TanStack Query統合も可能）
export const timelineQueryAtom = atomWithQuery(() => ({
  queryKey: ['timeline'],
  queryFn: async () => {
    const res = await fetch('/api/timeline');
    return res.json() as Promise<TimelineResponse>;
  },
}));

// 投稿更新用のwrite-only atom
export const updatePostAtom = atom(
  null,
  (
    get,
    set,
    { postId, updater }: { postId: string; updater: (p: Post) => Post },
  ) => {
    set(
      timelineItemsAtom,
      (prev) =>
        prev.map(item =>
          item.post.postId === postId
            ? { ...item, post: updater(item.post) }
            : item
        ),
    );
  },
);
```

```typescript
// atoms/ui.ts
import { atom } from 'jotai';

export const selectedIndexAtom = atom(-1);
export const emojiPickerOpenForIndexAtom = atom<number | null>(null);

// 返信ダイアログ状態（複合atom）
export const replyDialogAtom = atom<{
  postId: string | null;
  content: string;
}>({
  postId: null,
  content: '',
});

// 返信ダイアログ操作用atom
export const openReplyDialogAtom = atom(
  null,
  (_get, set, postId: string) => {
    set(replyDialogAtom, { postId, content: '' });
  },
);

export const closeReplyDialogAtom = atom(
  null,
  (_get, set) => {
    set(replyDialogAtom, { postId: null, content: '' });
  },
);
```

```typescript
// atoms/thread.ts
import { atom } from 'jotai';
import { loadable } from 'jotai/utils';

export const threadModalPostIdAtom = atom<string | null>(null);

// 非同期でスレッドデータを取得するatom
const threadDataBaseAtom = atom(async (get) => {
  const postId = get(threadModalPostIdAtom);
  if (!postId) return null;

  const res = await fetch(`/api/posts/${postId}/thread`);
  return res.json() as Promise<ThreadData>;
});

// loadableでローディング状態を管理
export const threadDataAtom = loadable(threadDataBaseAtom);
```

```typescript
// atoms/actions.ts
import { atom } from 'jotai';

// 各アクションの実行中状態
export const likingPostIdAtom = atom<string | null>(null);
export const undoingLikePostIdAtom = atom<string | null>(null);
export const repostingPostIdAtom = atom<string | null>(null);
export const undoingRepostPostIdAtom = atom<string | null>(null);
export const deletingPostIdAtom = atom<string | null>(null);
export const emojiReactingPostIdAtom = atom<string | null>(null);

// いいねアクションatom
export const likeActionAtom = atom(
  null,
  async (get, set, postId: string) => {
    set(likingPostIdAtom, postId);
    try {
      await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
      set(updatePostAtom, { postId, updater: (p) => ({ ...p, liked: true }) });
    } finally {
      set(likingPostIdAtom, null);
    }
  },
);
```

```typescript
// pages/home.tsx
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

const TimelineItem: FC<{ postId: string }> = ({ postId }) => {
  // このコンポーネントは、このpostIdに関連する状態変更時のみ再レンダー
  const post = useAtomValue(
    useMemo(() => atom((get) => get(postByIdAtom)(postId)), [postId]),
  );
  const like = useSetAtom(likeActionAtom);
  const likingPostId = useAtomValue(likingPostIdAtom);

  return (
    <div>
      <PostContent post={post} />
      <button
        onClick={() => like(postId)}
        disabled={likingPostId === postId}
      >
        Like
      </button>
    </div>
  );
};

const HomePage: FC = () => {
  const items = useAtomValue(timelineItemsAtom);
  const selectedIndex = useAtomValue(selectedIndexAtom);

  return (
    <div>
      <PostForm />
      {items.map((item, index) => (
        <TimelineItem
          key={item.post.postId}
          postId={item.post.postId}
          isSelected={index === selectedIndex}
        />
      ))}
      <ThreadModal />
      <ReplyDialog />
    </div>
  );
};
```

### メリット

- **細粒度のリアクティビティ**: 必要なatomを購読するコンポーネントのみ再レンダー
- **軽量**: バンドルサイズ約3KB (gzip)
- **シンプルなAPI**: atom()とuseAtom()が基本
- **派生状態が宣言的**: atomの依存関係で自動計算
- **TanStack Query統合可能**: jotai-tanstack-queryで連携
- **React Suspense対応**: 非同期atomがSuspenseと自然に統合

### デメリット

- **学習コスト**: Atomicモデルの理解が必要
- **デバッグツールが弱い**: Redux DevToolsほど充実していない
- **設計判断が必要**: どの粒度でatomを分けるかの判断
- **既存エコシステムとの統合**: 現在の実装との互換性を考慮必要

### 移行コスト

中（2-3週間）

---

## 比較表

| 観点                 | 選択肢1（Hooks+Context） | 選択肢2（TanStack+Zustand） | 選択肢3（useReducer） | 選択肢4（Jotai） |
| -------------------- | ------------------------ | --------------------------- | --------------------- | ---------------- |
| **追加ライブラリ**   | なし                     | 2つ（~15KB）                | なし                  | 1つ（~3KB）      |
| **学習コスト**       | 低                       | 中                          | 低〜中                | 中               |
| **移行コスト**       | 低〜中                   | 中〜高                      | 中                    | 中               |
| **サーバー状態管理** | 手動                     | 自動（優秀）                | 手動                  | 統合可能         |
| **再レンダー最適化** | 手動（useMemo）          | 自動                        | 手動（Context分割）   | 自動（細粒度）   |
| **DevTools**         | React DevTools           | TanStack DevTools           | 限定的                | jotai-devtools   |
| **テスト容易性**     | 高                       | 中                          | 高                    | 中〜高           |
| **型安全性**         | 高                       | 高                          | 高                    | 高               |
| **段階的移行**       | 容易                     | やや困難                    | 容易                  | 容易             |
| **楽観的更新**       | 手動実装                 | 組み込み                    | 手動実装              | 手動実装         |

---

## 推奨事項

### 短期的推奨: 選択肢1（Custom Hooks + Context）

**理由:**

1. **低リスク**: 追加ライブラリなしで既存知識で対応可能
2. **段階的移行**: 現在のコードから少しずつリファクタリング可能
3. **即座の効果**: Prop drillingの解消とコード分割で保守性向上
4. **将来の拡張性**: 後から選択肢2や4への移行も可能

### 長期的推奨: 選択肢2（TanStack Query + Zustand）への移行検討

**理由:**

1. **サーバー状態管理の成熟**: キャッシュ、リフェッチ、楽観的更新が充実
2. **業界標準**: 多くのプロジェクトで採用実績あり
3. **DevTools**: デバッグ体験が優れている

### 移行ステップ（選択肢1の場合）

```
Phase 1: Custom Hooks抽出（1週間）
  - useTimeline, usePostActions, useKeyboardNavigation を抽出
  - home.tsx のuseStateを各hookに移動

Phase 2: Context導入（1週間）
  - TimelineContextを作成
  - Prop drillingを解消

Phase 3: 共通hook作成（1週間）
  - useInfiniteScroll, usePullToRefresh を共通化
  - localUser.tsx, remoteUser.tsx との重複を解消

Phase 4: 最適化（1週間）
  - useMemo, useCallback の適用
  - 不要な再レンダーの解消
```

---

## 結論

タイムライン画面の状態管理には複数のアプローチが考えられる。**選択肢1（Custom Hooks + Context）**を短期的な改善として推奨し、プロジェクトの成長に応じて**選択肢2（TanStack Query + Zustand）**への移行を検討する。

重要なのは、どの選択肢を採用しても以下の原則を守ること：

1. **関心の分離**: サーバー状態、UI状態、アクション状態を明確に分ける
2. **単一責任**: 各hook/store/atomは一つの責務のみを持つ
3. **テスト可能性**: ロジックをコンポーネントから分離してテスト可能にする
4. **段階的改善**: 大規模なリライトではなく、小さな改善を積み重ねる

---

## 参考資料

- [React公式: Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [TanStack Query公式](https://tanstack.com/query/latest)
- [Zustand公式](https://docs.pmnd.rs/zustand)
- [Jotai公式](https://jotai.org/)
- [Kent C. Dodds: Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react)
