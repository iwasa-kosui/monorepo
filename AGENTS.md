# AGENTS.md

## 開発ワークフロー

### コード品質チェック（必須）

コードを変更した場合、以下のコマンドを**必ず**実行してください：

```bash
# ワークスペースパッケージのビルド（初回または依存変更時）
pnpm --filter result run build

# 型チェック（apps/microblogディレクトリで実行）
cd apps/microblog && pnpm exec tsc --noEmit

# Lintエラーの自動修正
pnpm lint:fix

# コードフォーマット
pnpm format

# テストの実行
pnpm test
```

#### 実行ルール

- **tsc --noEmit**: コード変更後は必ず実行し、すべての型エラーを解消してください
- **lint:fix**: コード変更後は必ず実行し、すべてのlintエラーを解消してください
- **format**: コミット前に必ず実行し、コードスタイルを統一してください
- **test**: 機能追加・修正後は必ず実行し、すべてのテストがパスすることを確認してください

これらのチェックがすべてパスしない限り、コードの変更は完了とみなしません。

---

## 開発方針

このドキュメントでは、プロジェクトの開発方針と設計パターンについて説明します。

### 1. Schema-Driven Development with Zod

スキーマ駆動開発として、`Zod`を使用してランタイム型検証とTypeScript型推論を統合しています。

#### 基本原則

- スキーマはドメインモデルの単一真実源(Single Source of Truth)です
- Zodの`brand()`を使用してBranded Typeを作成し、プリミティブ型の誤用を防ぎます
- `z.infer<typeof schema>`で型を導出し、型定義とバリデーションを統合します
- コンパニオンオブジェクトパターンで型の生成・操作メソッドを提供します

#### 実装例

```typescript
import { Result, ok, err, pipe, andThen } from '@iwasa-kosui/result';
import { z } from 'zod';
import { randomUUID } from 'crypto';

// Branded Typeを使用したPostId
const PostIdSym = Symbol('PostId');
const PostIdSchema = z.string().uuid().brand(PostIdSym).describe('PostId');
export type PostId = z.infer<typeof PostIdSchema>;

// コンパニオンオブジェクト
export const PostId = {
    // スキーマを外部に公開（他の型定義で参照するため）
    schema: PostIdSchema,
    
    // 新しいIDを生成
    generate: (): PostId => {
        return randomUUID() as PostId;
    },
    
    // 未検証のデータからパース
    parse: (data: unknown): Result<PostId, ValidationError> => {
        const result = PostIdSchema.safeParse(data);
        return result.success 
            ? ok(result.data) 
            : err(new ValidationError(result.error));
    },
    
    // パースまたは例外スロー（例外を使うべき場合のみ）
    parseOrThrow: (data: unknown): PostId => {
        return PostIdSchema.parse(data);
    },
} as const;
```

### 2. Always-Valid Domain Model

ドメインモデルは常に有効な状態を保つように設計します。不正な状態のオブジェクトが存在できないようにすることで、バグを防ぎます。

#### 基本原則

- オブジェクトの生成時にバリデーションを行い、不正なオブジェクトは作成させません
- Branded Typeを使用し、プリミティブ型の誤用を防ぎます
- コンパニオンオブジェクトパターンでファクトリメソッドを提供します
- 値オブジェクト（Value Object）を活用し、ドメインルールをカプセル化します
- 状態変更のメソッドも内部でバリデーションを行い、常に整合性を保ちます

#### 実装例

```typescript
import { z } from 'zod';
import { Result, ok, err, pipe, map } from '@iwasa-kosui/result';

// Branded Typeを使用したEmail
const EmailSym = Symbol('Email');
const EmailSchema = z.string().email().brand(EmailSym).describe('Email');
export type Email = z.infer<typeof EmailSchema>;

// コンパニオンオブジェクト
export const Email = {
    create: (value: string): Result<Email, ValidationError> => {
        const result = EmailSchema.safeParse(value);
        return result.success
            ? ok(result.data)
            : err(new ValidationError('Invalid email format'));
    },
} as const;

// 使用例: Emailは常に有効な形式が保証される
const emailResult = pipe(
    Email.create('user@example.com'),
    map(email => sendNotification(email))
);
```

```typescript
import { Result, ok, err, pipe, andThen } from '@iwasa-kosui/result';

// Branded Typeを使用したPostTitle
const PostTitleSym = Symbol('PostTitle');
const PostTitleSchema = z.string().min(1).max(200).brand(PostTitleSym).describe('PostTitle');
export type PostTitle = z.infer<typeof PostTitleSchema>;

// コンパニオンオブジェクト
export const PostTitle = {
    schema: PostTitleSchema,

    create: (value: unknown): Result<PostTitle, ValidationError> => {
        const result = PostTitleSchema.safeParse(value);
        return result.success
            ? ok(result.data)
            : err(new ValidationError('Invalid post title', result.error));
    },

    concat: (title: PostTitle, suffix: string): Result<PostTitle, ValidationError> => {
        // 結合後も検証を行い、常に有効な状態を保つ
        return PostTitle.create(title + suffix);
    },

    getValue: (title: PostTitle): string => {
        return title;
    },
} as const;
```

### 3. Railway Oriented Programming (ROP) with @iwasa-kosui/result

このプロジェクトでは、エラーハンドリングに`@iwasa-kosui/result`ライブラリを使用したRailway Oriented Programmingパターンを採用しています。

#### 基本原則

- 関数は`Result<T, E>`型を返すことで、成功(`Ok`)または失敗(`Err`)を明示的に表現します
- エラーは例外ではなく、型システムで追跡可能な値として扱います
- `map`、`andThen`、`orElse`などのメソッドチェーンでエラーハンドリングを構築します
- ドメイン層では`Result<T, E>`、ユースケース層では`ResultAsync<T, E>`を使用します

#### 実装例

```typescript
import { Result, ok, err, pipe } from '@iwasa-kosui/result';
import * as ResultAsync from '@iwasa-kosui/result/resultAsync';

type Dependencies = Readonly<{
    postByTitleResolver: PostByTitleResolver;
    postCreatedStore: PostCreatedStore;
}>;

type UseCase = Readonly<{
    run: (
        props: Omit<Post, 'postId'>
    ) => ResultAsync.ResultAsync<Post, PostAlreadyExists>;
}>;

const createUseCase = (
    { postByTitleResolver, postCreatedStore }: Dependencies
): UseCase => {
    const resolveByTitle = (
        props: Omit<Post, 'postId'>
    ): ResultAsync.ResultAsync<Post | undefined, never> =>
        postByTitleResolver.resolveByTitle(props.title);

    const errIfPostExists = (
        existingPost: Post | undefined,
    ): Result<void, PostAlreadyExists> =>
        existingPost
            ? err(PostAlreadyExists.new(existingPost.title))
            : ok(undefined);

    const run = (
        props: Omit<Post, 'postId'>
    ): ResultAsync.ResultAsync<Post, PostAlreadyExists> =>
        pipe(
            ResultAsync.ok(props),
            ResultAsync.andThen(resolveByTitle),
            ResultAsync.andThen(errIfPostExists),
            ResultAsync.map((): PostCreated => Post.create(props)),
            ResultAsync.andThrough((event: PostCreated): ResultAsync.ResultAsync<void, never> =>
                postCreatedStore.store(event)
            ),
            ResultAsync.map((event: PostCreated): Post => Post.fromEvent(event))
        );

    return { run } as const;
};
```

### 4. Event-Driven Design

イベント駆動設計を採用し、システム内の状態変化をイベントとして表現します。

#### 基本原則

- ドメインイベントを使用して、集約の状態変化を記録します
- イベントは不変であり、過去の事実を表します
- イベントソーシングやCQRSパターンへの拡張が容易になります

#### 実装例

```typescript
import { z } from 'zod';
import { randomUUID } from 'crypto';

const UnixTimeSym = Symbol('UnixTime');
const UnixTimeSchema = z.number().int().nonnegative().brand(UnixTimeSym).describe('UnixTime');
export type UnixTime = z.infer<typeof UnixTimeSchema>;
export const UnixTime = {
    now: (): UnixTime => {
        return Date.now() as UnixTime;
    },
    fromDate: (date: Date): UnixTime => {
        return date.getTime() as UnixTime;
    },
} as const;

const EventIdSym = Symbol('EventId');
const EventIdSchema = z.string().uuid().brand(EventIdSym).describe('EventId');
export type EventId = z.infer<typeof EventIdSchema>;
export const EventId = {
    generate: (): EventId => {
        return randomUUID() as EventId;
    },
} as const;

export type DomainEvent<
    /** 集約の種類 */
    TAggregateKind extends string,
    /** 集約のIDの型 */
    TAggregateId extends string | number,
    /** 集約の型 */
    TAggregate extends Record<string, unknown>,
    /** イベント名 */
    TEventName extends `${TAggregateKind}${string}`,
    /** イベント固有のペイロード */
    TEventPayload extends Record<string, unknown> | undefined,
> = Readonly<{
    /** 変更対象の集約の種類 */
    aggregateKind: TAggregateKind;
    /** 変更対象の集約のID */
    aggregateId: TAggregateId;
    /** 変更後の集約の状態 */
    aggregate: TAggregate;
    /** イベントID */
    eventId: EventId;
    /** イベント名 */
    eventName: TEventName;
    /** イベント固有のペイロード */
    eventPayload: TEventPayload;
    /** イベント発生日時（UnixTime） */
    eventAt: UnixTime;
}>;

const PostSchema = z.object({
    postId: PostId.schema,
    title: PostTitle.schema,
    status: z.enum(['draft', 'published', 'archived']),
}).describe('Post');

export type Post = z.infer<typeof PostSchema>;

export type PostEvent<
    TEventName extends string,
    TEventPayload extends Record<string, unknown> | undefined,
> = DomainEvent<'Post', PostId, Post, TEventName, TEventPayload>;

export const PostEvent = {
    create: <
        TEventName extends string,
        TEventPayload extends Record<string, unknown> | undefined,
    >(
        post: Post,
        eventName: TEventName,
        eventPayload: TEventPayload,
    ): PostEvent<TEventName, TEventPayload> => {
        return {
            aggregateKind: 'Post',
            aggregateId: post.postId,
            aggregate: post,
            eventId: EventId.generate(),
            eventName,
            eventPayload,
            eventAt: UnixTime.now(),
        };
    },
} as const;

export type PostPublished = PostEvent<'PostPublished', { publishedAt: Date }>;

export const Post = {
    publish: ({ title }: Omit<Post, 'postId' | 'status'>): PostPublished => {
        const postId = PostId.generate();
        const post: Post = { postId, title, status: 'published' };
        return PostEvent.create(post, 'PostPublished', { publishedAt: new Date() });
    },
} as const;
```

### 5. レイヤードアーキテクチャにおけるResultとResultAsyncの使い分け

#### 基本方針

- **ドメイン層**: `Result<T, E>`のみを使用し、同期的な処理に限定します
  - ビジネスルールの検証
  - ドメインモデルの生成と変更
  - ドメインイベントの生成
- **ユースケース層**: `ResultAsync<T, E>`の使用を許容し、アダプタと通信します
  - リポジトリやストアとの非同期通信
  - 複数のドメインロジックのオーケストレーション
  - トランザクション管理

#### 実装例

```typescript
import { Result, ok, err, pipe } from '@iwasa-kosui/result';
import * as ResultAsync from '@iwasa-kosui/result/resultAsync';

// ドメイン層：同期的な処理のみ
declare const Post: Readonly<{
    create: (props: { title: string }) => Result<PostPublished, never>;
}>;

// アダプタ層：非同期処理のインターフェース
type PostPublishedStore = Readonly<{
    store: (event: PostPublished) => ResultAsync.ResultAsync<void, StoreError>;
}>;

type PostByTitleResolver = Readonly<{
    resolve: (title: PostTitle) => ResultAsync.ResultAsync<Post | undefined, ResolverError>;
}>;

type Dependencies = Readonly<{
    postByTitleResolver: PostByTitleResolver;
    postPublishedStore: PostPublishedStore;
}>;

const createUseCase = (
    { postByTitleResolver, postPublishedStore }: Dependencies
) => {
    const errIfPostExists = (
        existingPost: Post | undefined,
    ): Result<void, PostAlreadyExists> =>
        existingPost
            ? err(PostAlreadyExists.new(existingPost.title))
            : ok(undefined);

    const run = (
        props: { title: string }
    ): ResultAsync.ResultAsync<Post, PostAlreadyExists | ValidationError | StoreError> =>
        pipe(
            ResultAsync.ok(props),
            ResultAsync.andThen(({title}) => postByTitleResolver.resolve(title)),
            ResultAsync.andThen(errIfPostExists),
            ResultAsync.map(() => Post.create({ title: props.title })),
            ResultAsync.andThrough((event: PostPublished): ResultAsync.ResultAsync<void, StoreError> =>
                postPublishedStore.store(event)
            ),
            ResultAsync.map((event: PostPublished): Post => Post.fromEvent(event))
        );

    return { run } as const;
};
```

この設計により、ドメイン層は純粋で副作用のない同期的なロジックに集中でき、テストも容易になります。

---

## ドメインモデル（microblog）

このセクションでは、`apps/microblog`のドメインモデルと集約設計について説明します。

### 集約一覧

本アプリケーションには以下の集約が存在します：

| 集約 | ID型 | 責務 | 場所 |
|-----|------|-----|------|
| **User** | `UserId` | ユーザー情報管理、認証 | `/domain/user/` |
| **Actor** | `ActorId` | ActivityPubアクター（ローカル/リモート） | `/domain/actor/` |
| **Post** | `PostId` | 投稿管理（ローカル/リモート） | `/domain/post/` |
| **Like** | `LikeId` | いいね管理 | `/domain/like/` |
| **Repost** | `RepostId` | リポスト（共有）管理 | `/domain/repost/` |
| **Notification** | `NotificationId` | 通知管理（いいね/フォロー） | `/domain/notification/` |
| **Follow** | 複合ID | フォロー関係管理 | `/domain/follow/` |
| **TimelineItem** | `TimelineItemId` | タイムラインアイテム | `/domain/timeline/` |
| **Session** | `SessionId` | セッション管理 | `/domain/session/` |
| **Key** | `KeyId` | ActivityPub署名用鍵ペア | `/domain/key/` |
| **PushSubscription** | `PushSubscriptionId` | Web Push購読 | `/domain/pushSubscription/` |
| **Image** | `ImageId` | 投稿添付画像 | `/domain/image/` |

### 集約間の参照関係

```
User (id: UserId)
  ├─→ LocalActor (userId)
  ├─→ Key (userId)
  ├─→ Session (userId)
  └─→ PushSubscription (userId)

Actor (id: ActorId)
  ├─→ Post (actorId)
  ├─→ Like (actorId)
  ├─→ Repost (actorId)
  ├─→ Notification (likerActorId, followerActorId)
  └─→ Follow (followerId, followingId)

Post (id: PostId)
  ├─→ Image (postId) [1:N]
  ├─→ TimelineItem (postId)
  ├─→ Repost (originalPostId) [1:N]
  └─→ Notification (likedPostId) [1:N]
```

### ドメインイベント

各集約は状態変化をドメインイベントとして発行します。

#### イベント構造

```typescript
type DomainEvent<TAggregate, TAggregateState, TEventName, TEventPayload> = Readonly<{
  aggregateId: AggregateId;      // 集約ID
  aggregateName: string;          // 集約名
  aggregateState: TAggregateState | undefined;  // 更新後の状態（削除時はundefined）
  eventId: EventId;               // イベントID
  eventName: TEventName;          // イベント名
  eventPayload: TEventPayload;    // イベント固有のペイロード
  occurredAt: Instant;            // 発生日時
}>;
```

#### 主要なドメインイベント

| 集約 | イベント名 | 発火条件 | aggregateState |
|-----|-----------|---------|----------------|
| Post | `post.created` | ローカル投稿作成 | `LocalPost` |
| Post | `post.remotePostCreated` | リモート投稿受信 | `RemotePost` |
| Post | `post.deleted` | 投稿削除 | `undefined` |
| Repost | `repost.repostCreated` | リポスト作成 | `Repost` |
| Repost | `repost.repostDeleted` | リポスト削除 | `undefined` |
| Notification | `notification.likeNotificationCreated` | いいね通知作成 | `LikeNotification` |
| Notification | `notification.likeNotificationDeleted` | いいね通知削除 | `undefined` |
| TimelineItem | `timelineItem.created` | タイムラインアイテム作成 | `TimelineItem` |
| TimelineItem | `timelineItem.deleted` | タイムラインアイテム削除 | `undefined` |
| Follow | `follow.followAccepted` | フォロー承認 | `Follow` |
| Follow | `follow.undoFollowingProcessed` | フォロー解除 | `undefined` |

### 集約境界の規則

#### 1. 集約間はID参照のみ

集約間の参照は、常にIDを介して行います。直接的なオブジェクト参照は禁止です。

```typescript
// ✓ 正しい: ID参照
type LikeNotification = {
  likedPostId: PostId;  // PostのIDを保持
};

// ✗ 間違い: 直接参照
type LikeNotification = {
  likedPost: Post;  // Postオブジェクトを直接保持
};
```

#### 2. ストアは自身の集約のみを操作

各集約のストア（Store）は、自身の集約のデータのみを操作します。他の集約のデータを直接削除・変更してはいけません。

```typescript
// ✓ 正しい: PostDeletedStoreはPostのみ削除
const PostDeletedStore = {
  store: async (event: PostDeleted) => {
    await tx.delete(postsTable).where(eq(postsTable.postId, event.eventPayload.postId));
    await tx.delete(postImagesTable).where(eq(postImagesTable.postId, event.eventPayload.postId));
    // Post集約内のデータのみ削除
  }
};

// ✗ 間違い: PostDeletedStoreが他の集約を削除
const PostDeletedStore = {
  store: async (event: PostDeleted) => {
    await tx.delete(notificationsTable).where(...);  // Notification集約を直接削除
  }
};
```

#### 3. カスケード削除はユースケース層で実装

親集約の削除時に子集約も削除する必要がある場合、ユースケース層で各集約のストアを呼び出します。
リゾルバーは並列実行し、イベントはバッチでストアに渡すことでN+1問題を回避します。

```typescript
// useCase/deletePost.ts
const run = async ({ postId }) => {
  // 1. 関連エンティティを並列で取得
  const [timelineItemResult, notificationsResult, repostsResult] = await Promise.all([
    timelineItemResolverByPostId.resolve({ postId }),
    likeNotificationsResolverByPostId.resolve({ postId }),
    repostsResolverByOriginalPostId.resolve({ originalPostId: postId }),
  ]);

  // 2. 削除イベントを生成
  const timelineItemEvents = timelineItemResult.ok && timelineItemResult.val
    ? [TimelineItem.deleteTimelineItem(timelineItemResult.val.timelineItemId, now)]
    : [];
  const notificationEvents = notificationsResult.ok
    ? notificationsResult.val.map((n) => Notification.deleteLikeNotification(n, now))
    : [];
  const repostEvents = repostsResult.ok
    ? repostsResult.val.map((r) => Repost.deleteRepost(r, now))
    : [];

  // 3. 関連集約をバッチ削除（各ストアは1トランザクションで処理）
  await Promise.all([
    timelineItemDeletedStore.store(...timelineItemEvents),
    likeNotificationDeletedStore.store(...notificationEvents),
    repostDeletedStore.store(...repostEvents),
  ]);

  // 4. Post削除
  await postDeletedStore.store(Post.deletePost(now)(postId));
};
```

#### 4. 削除順序は子→親

カスケード削除の順序は、参照関係の子から親へ向かう順序で実行します。

```
Post削除時の正しい順序:
  1. TimelineItem削除 (postIdを参照)
  2. LikeNotification削除 (likedPostIdを参照)
  3. Repost削除 (originalPostIdを参照)
  4. Post削除 ← 最後
```

#### 5. 削除イベントには既存データが必要

削除イベントを生成する際は、実際に存在するエンティティのデータを使用します。存在しないIDで削除イベントを生成してはいけません。

```typescript
// ✓ 正しい: 既存のエンティティから削除イベントを生成
const notification = await notificationResolver.resolve({ postId });
if (notification) {
  const event = Notification.deleteLikeNotification(notification, now);
  await store.store(event);
}

// ✗ 間違い: 存在確認なしに削除イベントを生成
const event = Notification.deleteLikeNotification({
  notificationId: NotificationId.generate(),  // 存在しないID
  ...
}, now);
```

### ストアとリゾルバーのパターン

#### Store（書き込み）

```typescript
type Store<T extends DomainEvent> = Readonly<{
  store: (...events: readonly T[]) => ResultAsync<void, never>;
}>;
```

**特徴:**
- rest parameterで複数イベントを受け取り、1トランザクションで処理
- 単一イベント: `store(event)`
- 複数イベント: `store(event1, event2)` または `store(...events)`
- N+1問題を回避し、パフォーマンスを向上

#### Resolver（読み取り）

```typescript
type Resolver<TCondition, TResolved> = Readonly<{
  resolve: (condition: TCondition) => ResultAsync<TResolved, never>;
}>;
```

#### 命名規則

| パターン | 命名規則 | 例 |
|---------|---------|-----|
| 単一取得 | `{Entity}Resolver` | `PostResolver` |
| 条件取得 | `{Entity}ResolverBy{Condition}` | `PostsResolverByActorId` |
| 複数取得 | `{Entities}ResolverBy{Condition}` | `TimelineItemsResolverByPostId` |
| 作成ストア | `{Event}Store` | `PostCreatedStore` |
| 削除ストア | `{Event}Store` | `PostDeletedStore` |

---

## まとめ

これらの設計パターンを組み合わせることで、以下を実現します:

1. **型安全性**: Branded TypeとZodによる厳格な型チェック
2. **信頼性**: Always-Valid Domain Modelによる不正状態の排除
3. **可読性**: Railway Oriented Programmingによる明示的なエラーハンドリング
4. **保守性**: 各層の責務が明確なレイヤードアーキテクチャ
5. **追跡可能性**: Event-Driven Designによる状態変化の記録

---

## プレゼンテーション作成（deck）

`talks/` ディレクトリ配下のプレゼンテーションは、[k1LoW/deck](https://github.com/k1LoW/deck) を使用してMarkdownからGoogle Slidesを生成します。

### 基本コマンド

```bash
# Markdownの変更をGoogle Slidesに反映
deck apply deck.md

# 変更を監視して自動反映（ライブプレビュー）
deck apply --watch deck.md

# ブラウザでプレゼンテーションを開く
deck open deck.md
```

### Markdown記法

- スライドは `---`（3つ以上のハイフン）で区切る
- `# 見出し1` → タイトル
- `## 見出し2` → サブタイトル
- それ以外のコンテンツ → ボディ

### サポートされる記法

- **太字**、*イタリック*、リンク、コードブロック
- 画像、テーブル、引用、リスト

### 注意事項

- `deck.md` のfrontmatterに `presentationID` が設定されている場合、そのプレゼンテーションを更新します
- 改行をそのまま反映したい場合は、frontmatterに `breaks: true` を設定してください
