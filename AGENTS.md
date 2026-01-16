# AGENTS.md

## 開発ワークフロー

### コード品質チェック（必須）

コードを変更した場合、以下のコマンドを**必ず**実行してください：

```bash
# Lintエラーの自動修正
pnpm lint:fix

# コードフォーマット
pnpm format

# テストの実行
pnpm test
```

#### 実行ルール

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
import { Result, ok, err } from 'neverthrow';
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
import { Result, ok, err } from 'neverthrow';

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
const emailResult = Email.create('user@example.com')
    .map(email => sendNotification(email));
```

```typescript
// Branded Typeを使用したPostTitle
const PostTitleSym = Symbol('PostTitle');
const PostTitleSchema = z.string().min(1).max(200).brand(PostTitleSym).describe('PostTitle');
export type PostTitle = z.infer<typeof PostTitleSchema>;

// コンパニオンオブジェクト
export const PostTitle = {
    schema: PostTitleSchema,
    
    create: (value: unknown): Result<PostTitle, ValidationError> => {
        return Result.fromThrowable(
            () => PostTitleSchema.parse(value),
            (e) => new ValidationError('Invalid post title', e)
        )();
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

### 3. Railway Oriented Programming (ROP) with neverthrow

このプロジェクトでは、エラーハンドリングに`neverthrow`ライブラリを使用したRailway Oriented Programmingパターンを採用しています。

#### 基本原則

- 関数は`Result<T, E>`型を返すことで、成功(`Ok`)または失敗(`Err`)を明示的に表現します
- エラーは例外ではなく、型システムで追跡可能な値として扱います
- `map`、`andThen`、`orElse`などのメソッドチェーンでエラーハンドリングを構築します
- ドメイン層では`Result<T, E>`、ユースケース層では`ResultAsync<T, E>`を使用します

#### 実装例

```typescript
import { Result, ResultAsync, ok, err, okAsync } from 'neverthrow';

type Dependencies = Readonly<{
    postByTitleResolver: PostByTitleResolver;
    postCreatedStore: PostCreatedStore;
}>;

type UseCase = Readonly<{
    run: (
        props: Omit<Post, 'postId'>
    ) => ResultAsync<Post, PostAlreadyExists>;
}>;

const createUseCase = (
    { postByTitleResolver, postCreatedStore }: Dependencies
): UseCase => {
    const resolveByTitle = (
        props: Omit<Post, 'postId'>
    ): ResultAsync<Post | undefined, never> =>
        postByTitleResolver.resolveByTitle(props.title);

    const errIfPostExists = (
        existingPost: Post | undefined,
    ): Result<void, PostAlreadyExists> =>
        existingPost
            ? err(PostAlreadyExists.new(existingPost.title))
            : ok(undefined);

    const run = (
        props: Omit<Post, 'postId'>
    ): ResultAsync<Post, PostAlreadyExists> =>
        okAsync(props)
            .andThen(resolveByTitle)
            .andThen(errIfPostExists)
            .map((): PostCreated => Post.create(props))
            .andThrough((event: PostCreated): ResultAsync<void, never> =>
                postCreatedStore.store(event)
            )
            .map((event: PostCreated): Post => Post.fromEvent(event));

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
import { Result, ResultAsync, ok, err } from 'neverthrow';

// ドメイン層：同期的な処理のみ
declare const Post: Readonly<{
    create: (props: { title: string }) => Result<PostPublished, never>;
}>;

// アダプタ層：非同期処理のインターフェース
type PostPublishedStore = Readonly<{
    store: (event: PostPublished) => ResultAsync<void, StoreError>;
}>;

type PostByTitleResolver = Readonly<{
    resolve: (title: PostTitle) => ResultAsync<Post | undefined, ResolverError>;
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

    const run = (props: { title: string }): ResultAsync<Post, PostAlreadyExists | ValidationError | StoreError> =>
        okAsync(props)
            .andThen(({title}) => postByTitleResolver.resolve(title))
            .andThen(errIfPostExists)
            .map(() => Post.create({ title: props.title }))
            .andThrough((event: PostPublished): ResultAsync<void, StoreError> =>
                postPublishedStore.store(event)
            )
            .map((event: PostPublished): Post => Post.fromEvent(event));

    return { run } as const;
};
```

この設計により、ドメイン層は純粋で副作用のない同期的なロジックに集中でき、テストも容易になります。

---

## まとめ

これらの設計パターンを組み合わせることで、以下を実現します:

1. **型安全性**: Branded TypeとZodによる厳格な型チェック
2. **信頼性**: Always-Valid Domain Modelによる不正状態の排除
3. **可読性**: Railway Oriented Programmingによる明示的なエラーハンドリング
4. **保守性**: 各層の責務が明確なレイヤードアーキテクチャ
5. **追跡可能性**: Event-Driven Designによる状態変化の記録
