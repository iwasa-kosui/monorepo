# Article（記事）機能 仕様書

## 1. 概要

### 1.1 背景

microblogアプリケーションでは、Postとそのリプライによるスレッド形式の会話が可能だが、複数の投稿を「記事」としてまとめて公開する機能がない。

### 1.2 目的

- 自分が投稿したPostとそのスレッド（全リプライチェーン）を「記事」として公開できるようにする
- 記事は `draft` → `published` → `unpublished` の状態管理ができる
- ActivityPubを通じて他のFediverseサーバーからも閲覧可能にする

### 1.3 スコープ

| 項目                                   | 対応    |
| -------------------------------------- | ------- |
| 記事の作成（下書き）                   | MVP     |
| 記事の公開                             | MVP     |
| 記事の非公開化                         | MVP     |
| 記事の削除                             | MVP     |
| 記事のActivityPub配信（Create/Delete） | MVP     |
| 記事一覧表示                           | Phase 2 |
| 記事詳細ページ                         | Phase 2 |

---

## 2. ドメインモデル設計

### 2.1 Article集約

新しい集約 `Article` を追加する。

```
apps/microblog/src/domain/article/
├── articleId.ts      # ArticleId Branded Type
├── article.ts        # Article集約定義
└── index.ts          # エクスポート
```

### 2.2 型定義

**ArticleId（`articleId.ts`）：**

```typescript
import { z } from 'zod/v4';
import { Schema } from '../../helper/schema.ts';

const ArticleIdSym = Symbol('ArticleId');
const zodType = z.uuid().brand(ArticleIdSym).describe('ArticleId');
export type ArticleId = z.output<typeof zodType>;

const schema = Schema.create(zodType);

export const ArticleId = {
  ...schema,
  generate: (): ArticleId => crypto.randomUUID() as ArticleId,
} as const;
```

**ArticleStatus：**

```typescript
const ArticleStatusZodType = z.enum(['draft', 'published', 'unpublished']);
export type ArticleStatus = z.infer<typeof ArticleStatusZodType>;

export const ArticleStatus = {
  zodType: ArticleStatusZodType,
  Draft: 'draft' as const,
  Published: 'published' as const,
  Unpublished: 'unpublished' as const,
} as const;
```

**Article集約（`article.ts`）：**

```typescript
import { z } from 'zod/v4';
import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { UserId } from '../user/userId.ts';
import { ArticleId } from './articleId.ts';

const articleZodType = z.object({
  articleId: ArticleId.zodType,
  authorActorId: ActorId.zodType,
  authorUserId: UserId.zodType,
  rootPostId: PostId.zodType,
  title: z.string().min(1).max(200),
  status: z.enum(['draft', 'published', 'unpublished']),
  createdAt: Instant.zodType,
  publishedAt: z.nullable(Instant.zodType),
  unpublishedAt: z.nullable(Instant.zodType),
});

export type Article = z.infer<typeof articleZodType>;

type ArticleAggregate = Agg.Aggregate<ArticleId, 'article', Article>;

export type ArticleEvent<
  TAggregateState extends Agg.InferState<ArticleAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<ArticleAggregate, TAggregateState, TEventName, TEventPayload>;

export const ArticleEvent = AggregateEvent.createFactory<ArticleAggregate>(
  'article',
);
```

### 2.3 ドメインイベント

| イベント名            | aggregateState | eventPayload                   | 発火条件           |
| --------------------- | -------------- | ------------------------------ | ------------------ |
| `article.created`     | `Article`      | `Article`                      | 記事作成（下書き） |
| `article.published`   | `Article`      | `{ articleId, publishedAt }`   | 記事公開           |
| `article.unpublished` | `Article`      | `{ articleId, unpublishedAt }` | 記事非公開化       |
| `article.deleted`     | `undefined`    | `{ articleId, deletedAt }`     | 記事削除           |

**イベント型定義：**

```typescript
export type ArticleCreated = ArticleEvent<Article, 'article.created', Article>;
export type ArticlePublished = ArticleEvent<
  Article,
  'article.published',
  { articleId: ArticleId; publishedAt: Instant }
>;
export type ArticleUnpublished = ArticleEvent<
  Article,
  'article.unpublished',
  { articleId: ArticleId; unpublishedAt: Instant }
>;
export type ArticleDeleted = ArticleEvent<
  undefined,
  'article.deleted',
  { articleId: ArticleId; deletedAt: Instant }
>;
```

### 2.4 ファクトリメソッド

```typescript
const createArticle = (now: Instant) =>
(
  payload: Omit<
    Article,
    'articleId' | 'status' | 'createdAt' | 'publishedAt' | 'unpublishedAt'
  >,
): ArticleCreated => {
  const articleId = ArticleId.generate();
  const article: Article = {
    ...payload,
    articleId,
    status: 'draft',
    createdAt: now,
    publishedAt: null,
    unpublishedAt: null,
  };
  return ArticleEvent.create(
    articleId,
    article,
    'article.created',
    article,
    now,
  );
};

const publishArticle = (article: Article, now: Instant): ArticlePublished => {
  const publishedArticle: Article = {
    ...article,
    status: 'published',
    publishedAt: now,
  };
  return ArticleEvent.create(
    article.articleId,
    publishedArticle,
    'article.published',
    { articleId: article.articleId, publishedAt: now },
    now,
  );
};

const unpublishArticle = (
  article: Article,
  now: Instant,
): ArticleUnpublished => {
  const unpublishedArticle: Article = {
    ...article,
    status: 'unpublished',
    unpublishedAt: now,
  };
  return ArticleEvent.create(
    article.articleId,
    unpublishedArticle,
    'article.unpublished',
    { articleId: article.articleId, unpublishedAt: now },
    now,
  );
};

const deleteArticle = (articleId: ArticleId, now: Instant): ArticleDeleted => {
  return ArticleEvent.create(
    articleId,
    undefined,
    'article.deleted',
    { articleId, deletedAt: now },
    now,
  );
};

export const Article = {
  ...Schema.create(articleZodType),
  createArticle,
  publishArticle,
  unpublishArticle,
  deleteArticle,
} as const;
```

### 2.5 Store/Resolver型

```typescript
export type ArticleCreatedStore = Agg.Store<ArticleCreated>;
export type ArticlePublishedStore = Agg.Store<ArticlePublished>;
export type ArticleUnpublishedStore = Agg.Store<ArticleUnpublished>;
export type ArticleDeletedStore = Agg.Store<ArticleDeleted>;

export type ArticleResolver = Agg.Resolver<ArticleId, Article | undefined>;
export type ArticleResolverByRootPostId = Agg.Resolver<
  { rootPostId: PostId },
  Article | undefined
>;
export type ArticlesResolverByAuthorActorId = Agg.Resolver<
  { actorId: ActorId },
  Article[]
>;
export type PublishedArticlesResolverByAuthorActorId = Agg.Resolver<
  { actorId: ActorId },
  Article[]
>;
```

### 2.6 エラー型

```typescript
export type ArticleNotFoundError = Readonly<{
  type: 'ArticleNotFoundError';
  message: string;
  detail: { articleId: ArticleId };
}>;

export const ArticleNotFoundError = {
  create: (articleId: ArticleId): ArticleNotFoundError => ({
    type: 'ArticleNotFoundError',
    message: `The article with ID "${articleId}" was not found.`,
    detail: { articleId },
  }),
} as const;

export type ArticleAlreadyExistsError = Readonly<{
  type: 'ArticleAlreadyExistsError';
  message: string;
  detail: { rootPostId: PostId };
}>;

export const ArticleAlreadyExistsError = {
  create: (rootPostId: PostId): ArticleAlreadyExistsError => ({
    type: 'ArticleAlreadyExistsError',
    message: `An article for post "${rootPostId}" already exists.`,
    detail: { rootPostId },
  }),
} as const;

export type ArticleAlreadyPublishedError = Readonly<{
  type: 'ArticleAlreadyPublishedError';
  message: string;
  detail: { articleId: ArticleId };
}>;

export type ArticleNotPublishedError = Readonly<{
  type: 'ArticleNotPublishedError';
  message: string;
  detail: { articleId: ArticleId };
}>;
```

---

## 3. データベーススキーマ

### 3.1 articlesテーブル

```sql
CREATE TABLE articles (
  article_id UUID PRIMARY KEY,
  author_actor_id UUID NOT NULL REFERENCES actors(actor_id),
  author_user_id UUID NOT NULL REFERENCES users(user_id),
  root_post_id UUID NOT NULL REFERENCES posts(post_id),
  title VARCHAR(200) NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  unpublished_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT article_root_post_unique UNIQUE (root_post_id)
);

CREATE INDEX articles_author_actor_id_idx ON articles(author_actor_id);
CREATE INDEX articles_root_post_id_idx ON articles(root_post_id);
CREATE INDEX articles_status_idx ON articles(status);
```

### 3.2 Drizzle ORMスキーマ

```typescript
// adaptor/pg/schema.ts に追加

export const articlesTable = pgTable('articles', {
  articleId: uuid().primaryKey(),
  authorActorId: uuid().notNull().references(() => actorsTable.actorId),
  authorUserId: uuid().notNull().references(() => usersTable.userId),
  rootPostId: uuid().notNull().references(() => postsTable.postId),
  title: varchar({ length: 200 }).notNull(),
  status: varchar({ length: 16 }).notNull(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
  publishedAt: timestamp({ mode: 'date' }),
  unpublishedAt: timestamp({ mode: 'date' }),
}, (table) => [
  index('articles_author_actor_id_idx').on(table.authorActorId),
  index('articles_root_post_id_idx').on(table.rootPostId),
  index('articles_status_idx').on(table.status),
  unique('article_root_post_unique').on(table.rootPostId),
]);
```

---

## 4. スレッド取得

### 4.1 設計方針

Articleは `rootPostId` への参照のみを保持し、スレッド内容は動的に取得する。

**理由：**

1. スレッドは投稿の追加・削除で動的に変化する
2. スナップショットを取ると、更新時の整合性管理が複雑になる
3. 既存の `ThreadResolver` パターンを活用できる

### 4.2 FullThreadResolverByRootPostId

rootPostを起点として、全ての子孫（descendants）を再帰的に取得するリゾルバ。

```typescript
export type FullThreadResolverByRootPostId = Agg.Resolver<
  { rootPostId: PostId },
  PostWithAuthor[]
>;
```

**実装アルゴリズム：**

```typescript
const resolve = async ({ rootPostId }): RA<PostWithAuthor[], never> => {
  const posts: PostWithAuthor[] = [];

  // 1. rootPostを取得
  const rootPost = await getPostById(rootPostId);
  if (!rootPost) return RA.ok([]);
  posts.push(rootPost);

  // 2. rootPostのURIを構築
  const rootPostUris = [buildPostUri(rootPost)];

  // 3. 子孫を再帰的に取得
  let currentUris = rootPostUris;
  while (currentUris.length > 0) {
    const descendants = await getPostsByInReplyToUris(currentUris);
    if (descendants.length === 0) break;
    posts.push(...descendants);
    currentUris = descendants.map(p => buildPostUri(p));
  }

  // 4. 時系列でソート
  return RA.ok(posts.sort((a, b) => a.createdAt - b.createdAt));
};
```

---

## 5. ActivityPub連携

### 5.1 Article ObjectDispatcher

**ファイル：** `adaptor/fedify/objectDispatcher.ts`

```typescript
import { Article as FedifyArticle } from '@fedify/fedify';

export const ofArticle = async (
  ctx: RequestContext<unknown>,
  values: Record<'id' | 'identifier', string>,
) => {
  const articleId = ArticleId.orThrow(values.id);

  // 1. 記事を取得
  const article = await articleResolver.resolve(articleId);
  if (!article || article.status !== 'published') {
    return null;
  }

  // 2. スレッド全体を取得
  const threadPosts = await fullThreadResolverByRootPostId.resolve({
    rootPostId: article.rootPostId,
  });

  // 3. スレッド内容をHTMLに整形
  const content = formatThreadAsHtml(threadPosts);

  // 4. FedifyArticleオブジェクトを返却
  return new FedifyArticle({
    id: ctx.getObjectUri(FedifyArticle, values),
    attribution: ctx.getActorUri(values.identifier),
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(values.identifier),
    name: article.title,
    content,
    mediaType: 'text/html',
    published: Temporal.Instant.fromEpochMilliseconds(article.publishedAt!),
    url: ctx.getObjectUri(FedifyArticle, values),
  });
};
```

### 5.2 HTML整形関数

```typescript
const formatThreadAsHtml = (posts: PostWithAuthor[]): string => {
  const sections = posts.map(post => {
    const authorHandle = post.type === 'local'
      ? `@${post.username}`
      : `@${post.username}@${new URL(post.uri).host}`;

    return `
      <section class="thread-post">
        <header>
          <strong>${escapeHtml(authorHandle)}</strong>
          <time datetime="${new Date(post.createdAt).toISOString()}">
            ${formatDate(post.createdAt)}
          </time>
        </header>
        <div class="content">${post.content}</div>
      </section>
    `.trim();
  });

  return `<article class="thread">${sections.join('<hr/>')}</article>`;
};
```

### 5.3 federation.tsへの登録

```typescript
import { Article as FedifyArticle } from '@fedify/fedify';

// Articleエンドポイントを追加
federation.setObjectDispatcher(
  FedifyArticle,
  '/users/{identifier}/articles/{id}',
  ObjectDispatcher.ofArticle,
);
```

### 5.4 アクティビティ配信

**公開時（Create Activity）：**

```typescript
// publishArticle.ts
await ctx.sendActivity(
  { identifier: user.username },
  'followers',
  new Create({
    id: new URL('#activity', articleUri),
    object: article,
    actors: article.attributionIds,
    tos: article.toIds,
    ccs: article.ccIds,
  }),
);
```

**非公開/削除時（Delete Activity）：**

```typescript
// unpublishArticle.ts / deleteArticle.ts
await ctx.sendActivity(
  { identifier: user.username },
  'followers',
  new Delete({
    id: new URL(`#delete-${articleId}`, articleUri),
    actor: ctx.getActorUri(user.username),
    object: new Tombstone({
      id: articleUri,
    }),
  }),
);
```

---

## 6. ユースケース

### 6.1 ディレクトリ構造

```
apps/microblog/src/useCase/
├── createArticle.ts       # 記事作成（下書き）
├── publishArticle.ts      # 記事公開
├── unpublishArticle.ts    # 記事非公開化
└── deleteArticle.ts       # 記事削除
```

### 6.2 CreateArticleUseCase

```typescript
type Input = Readonly<{
  sessionId: SessionId;
  rootPostId: PostId;
  title: string;
}>;

type Output = Article;
type Err =
  | SessionExpiredError
  | PostNotFoundError
  | UnauthorizedError
  | ArticleAlreadyExistsError;

const run = (input: Input): RA<Output, Err> => {
  return RA.flow(
    RA.ok(input),
    // 1. セッション解決
    RA.andBind(
      'session',
      ({ sessionId }) => sessionResolver.resolve(sessionId),
    ),
    // 2. ユーザー解決
    RA.andBind('user', ({ session }) => userResolver.resolve(session.userId)),
    // 3. ローカルアクター解決
    RA.andBind('actor', ({ user }) => actorResolverByUserId.resolve(user.id)),
    // 4. rootPost解決
    RA.andBind(
      'rootPost',
      ({ rootPostId }) => postResolver.resolve(rootPostId),
    ),
    RA.andThen(({ rootPost }) =>
      rootPost
        ? RA.ok(undefined)
        : RA.err(PostNotFoundError.create(input.rootPostId))
    ),
    // 5. 所有権確認（rootPostが自分の投稿か）
    RA.andThen(({ rootPost, user }) => {
      if (rootPost.type !== 'local' || rootPost.userId !== user.id) {
        return RA.err(UnauthorizedError.create());
      }
      return RA.ok(undefined);
    }),
    // 6. 既存記事確認
    RA.andBind(
      'existingArticle',
      ({ rootPostId }) => articleResolverByRootPostId.resolve({ rootPostId }),
    ),
    RA.andThen(({ existingArticle }) =>
      existingArticle
        ? RA.err(ArticleAlreadyExistsError.create(input.rootPostId))
        : RA.ok(undefined)
    ),
    // 7. 記事作成
    RA.andBind('event', ({ actor, user, title, rootPostId }) => {
      const event = Article.createArticle(Instant.now())({
        authorActorId: actor.id,
        authorUserId: user.id,
        rootPostId,
        title,
      });
      return articleCreatedStore.store(event).map(() => event);
    }),
    RA.map(({ event }) => event.aggregateState),
  );
};
```

### 6.3 PublishArticleUseCase

```typescript
type Input = Readonly<{
  sessionId: SessionId;
  articleId: ArticleId;
  ctx: RequestContext<unknown>;
}>;

type Output = Article;
type Err =
  | SessionExpiredError
  | ArticleNotFoundError
  | UnauthorizedError
  | ArticleAlreadyPublishedError;

const run = (input: Input): RA<Output, Err> => {
  return RA.flow(
    RA.ok(input),
    // 1-3. セッション/ユーザー/アクター解決（省略）
    // 4. 記事解決
    RA.andBind(
      'article',
      ({ articleId }) => articleResolver.resolve(articleId),
    ),
    RA.andThen(({ article }) =>
      article
        ? RA.ok(undefined)
        : RA.err(ArticleNotFoundError.create(input.articleId))
    ),
    // 5. 所有権確認
    RA.andThen(({ article, user }) => {
      if (article.authorUserId !== user.id) {
        return RA.err(UnauthorizedError.create());
      }
      return RA.ok(undefined);
    }),
    // 6. ステータス確認
    RA.andThen(({ article }) => {
      if (article.status === 'published') {
        return RA.err(ArticleAlreadyPublishedError.create(article.articleId));
      }
      return RA.ok(undefined);
    }),
    // 7. 記事公開
    RA.andBind('event', ({ article }) => {
      const event = Article.publishArticle(article, Instant.now());
      return articlePublishedStore.store(event).map(() => event);
    }),
    // 8. スレッド取得
    RA.andBind(
      'threadPosts',
      ({ article }) =>
        fullThreadResolverByRootPostId.resolve({
          rootPostId: article.rootPostId,
        }),
    ),
    // 9. ActivityPub配信
    RA.andThrough(async ({ ctx, user, event, threadPosts }) => {
      const articleObject = createArticleObject(
        ctx,
        event.aggregateState,
        threadPosts,
        user,
      );
      await ctx.sendActivity(
        { identifier: user.username },
        'followers',
        new Create({
          id: new URL('#activity', articleObject.id),
          object: articleObject,
          actors: articleObject.attributionIds,
          tos: articleObject.toIds,
          ccs: articleObject.ccIds,
        }),
      );
      return RA.ok(undefined);
    }),
    RA.map(({ event }) => event.aggregateState),
  );
};
```

### 6.4 UnpublishArticleUseCase

```typescript
type Input = Readonly<{
  sessionId: SessionId;
  articleId: ArticleId;
  ctx: RequestContext<unknown>;
}>;

const run = (input: Input): RA<Article, Err> => {
  return RA.flow(
    RA.ok(input),
    // 1-5. 解決と確認（省略）
    // 6. ステータス確認
    RA.andThen(({ article }) => {
      if (article.status !== 'published') {
        return RA.err(ArticleNotPublishedError.create(article.articleId));
      }
      return RA.ok(undefined);
    }),
    // 7. 記事非公開化
    RA.andBind('event', ({ article }) => {
      const event = Article.unpublishArticle(article, Instant.now());
      return articleUnpublishedStore.store(event).map(() => event);
    }),
    // 8. ActivityPub Delete配信
    RA.andThrough(async ({ ctx, user, article }) => {
      const articleUri = ctx.getObjectUri(FedifyArticle, {
        identifier: user.username,
        id: article.articleId,
      });
      await ctx.sendActivity(
        { identifier: user.username },
        'followers',
        new Delete({
          id: new URL(`#delete-${article.articleId}`, articleUri),
          actor: ctx.getActorUri(user.username),
          object: new Tombstone({ id: articleUri }),
        }),
      );
      return RA.ok(undefined);
    }),
    RA.map(({ event }) => event.aggregateState),
  );
};
```

### 6.5 DeleteArticleUseCase

```typescript
type Input = Readonly<{
  sessionId: SessionId;
  articleId: ArticleId;
  ctx: RequestContext<unknown>;
}>;

const run = (input: Input): RA<void, Err> => {
  return RA.flow(
    RA.ok(input),
    // 1-5. 解決と確認（省略）
    // 6. 公開済みならActivityPub Delete配信
    RA.andThrough(async ({ ctx, user, article }) => {
      if (article.status === 'published') {
        const articleUri = ctx.getObjectUri(FedifyArticle, {
          identifier: user.username,
          id: article.articleId,
        });
        await ctx.sendActivity(
          { identifier: user.username },
          'followers',
          new Delete({
            id: new URL(`#delete-${article.articleId}`, articleUri),
            actor: ctx.getActorUri(user.username),
            object: new Tombstone({ id: articleUri }),
          }),
        );
      }
      return RA.ok(undefined);
    }),
    // 7. 記事削除
    RA.andThrough(({ article }) => {
      const event = Article.deleteArticle(article.articleId, Instant.now());
      return articleDeletedStore.store(event);
    }),
    RA.map(() => undefined),
  );
};
```

---

## 7. カスケード削除

### 7.1 rootPost削除時のArticle削除

`useCase/deletePost.ts` を修正し、rootPostに紐づくArticleも削除する。

```typescript
// deletePost.ts に追加

// 関連するArticleを取得
RA.andBind('article', ({ postId }) =>
  articleResolverByRootPostId.resolve({ rootPostId: postId })
),

// Articleが存在する場合、削除イベントを生成
RA.andBind('articleEvent', ({ article }) => {
  if (!article) return RA.ok(undefined);
  return RA.ok(Article.deleteArticle(article.articleId, Instant.now()));
}),

// Articleの削除を実行
RA.andThrough(async ({ articleEvent, article, ctx, user }) => {
  if (!articleEvent) return RA.ok(undefined);

  // 公開済みならActivityPub Delete配信
  if (article.status === 'published') {
    const articleUri = ctx.getObjectUri(FedifyArticle, {
      identifier: user.username,
      id: article.articleId,
    });
    await ctx.sendActivity(
      { identifier: user.username },
      'followers',
      new Delete({
        id: new URL(`#delete-${article.articleId}`, articleUri),
        actor: ctx.getActorUri(user.username),
        object: new Tombstone({ id: articleUri }),
      }),
    );
  }

  return articleDeletedStore.store(articleEvent);
}),
```

---

## 8. ストア/リゾルバー実装

### 8.1 ディレクトリ構造

```
apps/microblog/src/adaptor/pg/article/
├── articleCreatedStore.ts
├── articlePublishedStore.ts
├── articleUnpublishedStore.ts
├── articleDeletedStore.ts
├── articleResolver.ts
├── articleResolverByRootPostId.ts
├── articlesResolverByAuthorActorId.ts
└── index.ts
```

### 8.2 ArticleCreatedStore

```typescript
const store = async (...events: readonly ArticleCreated[]): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      const article = event.aggregateState;
      await tx.insert(articlesTable).values({
        articleId: article.articleId,
        authorActorId: article.authorActorId,
        authorUserId: article.authorUserId,
        rootPostId: article.rootPostId,
        title: article.title,
        status: article.status,
        createdAt: Instant.toDate(article.createdAt),
        publishedAt: null,
        unpublishedAt: null,
      });
      await tx.insert(domainEventsTable).values({
        eventId: event.eventId,
        aggregateId: { articleId: article.articleId },
        aggregateName: event.aggregateName,
        aggregateState: event.aggregateState,
        eventName: event.eventName,
        eventPayload: event.eventPayload,
        occurredAt: Instant.toDate(event.occurredAt),
      });
    }
  });
  return RA.ok(undefined);
};
```

### 8.3 ArticlePublishedStore

```typescript
const store = async (...events: readonly ArticlePublished[]): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      const article = event.aggregateState;
      await tx.update(articlesTable)
        .set({
          status: article.status,
          publishedAt: Instant.toDate(article.publishedAt!),
        })
        .where(eq(articlesTable.articleId, article.articleId));
      await tx.insert(domainEventsTable).values({...});
    }
  });
  return RA.ok(undefined);
};
```

### 8.4 ArticleResolver

```typescript
const resolve = async (
  articleId: ArticleId,
): RA<Article | undefined, never> => {
  const [row] = await DB.getInstance()
    .select()
    .from(articlesTable)
    .where(eq(articlesTable.articleId, articleId))
    .limit(1);

  if (!row) return RA.ok(undefined);

  return RA.ok({
    articleId: ArticleId.orThrow(row.articleId),
    authorActorId: ActorId.orThrow(row.authorActorId),
    authorUserId: UserId.orThrow(row.authorUserId),
    rootPostId: PostId.orThrow(row.rootPostId),
    title: row.title,
    status: row.status as ArticleStatus,
    createdAt: Instant.fromDate(row.createdAt),
    publishedAt: row.publishedAt ? Instant.fromDate(row.publishedAt) : null,
    unpublishedAt: row.unpublishedAt
      ? Instant.fromDate(row.unpublishedAt)
      : null,
  });
};
```

---

## 9. 実装タスク

### Phase 1: ドメイン層

| #   | タスク                             | 依存 |
| --- | ---------------------------------- | ---- |
| 1.1 | `domain/article/articleId.ts` 実装 | -    |
| 1.2 | `domain/article/article.ts` 実装   | 1.1  |
| 1.3 | `domain/article/index.ts` 作成     | 1.2  |

### Phase 2: データベース層

| #   | タスク                                        | 依存 |
| --- | --------------------------------------------- | ---- |
| 2.1 | `adaptor/pg/schema.ts` にarticlesテーブル追加 | -    |
| 2.2 | マイグレーションファイル生成・実行            | 2.1  |

### Phase 3: Adapter層（Store/Resolver）

| #   | タスク                                                  | 依存     |
| --- | ------------------------------------------------------- | -------- |
| 3.1 | `adaptor/pg/article/articleCreatedStore.ts`             | 1.2, 2.1 |
| 3.2 | `adaptor/pg/article/articlePublishedStore.ts`           | 1.2, 2.1 |
| 3.3 | `adaptor/pg/article/articleUnpublishedStore.ts`         | 1.2, 2.1 |
| 3.4 | `adaptor/pg/article/articleDeletedStore.ts`             | 1.2, 2.1 |
| 3.5 | `adaptor/pg/article/articleResolver.ts`                 | 1.2, 2.1 |
| 3.6 | `adaptor/pg/article/articleResolverByRootPostId.ts`     | 1.2, 2.1 |
| 3.7 | `adaptor/pg/article/articlesResolverByAuthorActorId.ts` | 1.2, 2.1 |
| 3.8 | `adaptor/pg/post/fullThreadResolverByRootPostId.ts`     | -        |

### Phase 4: ActivityPub層

| #   | タスク                                               | 依存     |
| --- | ---------------------------------------------------- | -------- |
| 4.1 | `adaptor/fedify/objectDispatcher.ts` にofArticle追加 | 3.5, 3.8 |
| 4.2 | `federation.ts` にArticle ObjectDispatcher登録       | 4.1      |

### Phase 5: ユースケース層

| #   | タスク                                         | 依存               |
| --- | ---------------------------------------------- | ------------------ |
| 5.1 | `useCase/createArticle.ts`                     | 3.1, 3.5, 3.6      |
| 5.2 | `useCase/publishArticle.ts`                    | 3.2, 3.5, 3.8, 4.1 |
| 5.3 | `useCase/unpublishArticle.ts`                  | 3.3, 3.5, 4.1      |
| 5.4 | `useCase/deleteArticle.ts`                     | 3.4, 3.5, 4.1      |
| 5.5 | `useCase/deletePost.ts` 修正（カスケード削除） | 3.4, 3.6, 4.1      |

---

## 10. 重要ファイル一覧

| ファイル                                 | 参照目的                                  |
| ---------------------------------------- | ----------------------------------------- |
| `src/domain/post/post.ts`                | DomainEventパターン、Store/Resolver型定義 |
| `src/domain/post/postId.ts`              | Branded Type実装パターン                  |
| `src/adaptor/pg/schema.ts`               | DBスキーマ定義パターン                    |
| `src/adaptor/pg/post/threadResolver.ts`  | スレッド取得ロジック                      |
| `src/adaptor/fedify/objectDispatcher.ts` | ObjectDispatcherパターン                  |
| `src/federation.ts`                      | Fedify設定パターン                        |
| `src/useCase/createPost.ts`              | ユースケース実装パターン                  |
| `src/useCase/deletePost.ts`              | カスケード削除パターン                    |

---

## 11. 検証方法

### 11.1 単体テスト

```bash
pnpm --filter microblog test:ci
```

### 11.2 型チェック

```bash
pnpm --filter microblog tsc --noEmit
```

### 11.3 Lint/Format

```bash
pnpm --filter microblog lint:fix
pnpm --filter microblog format
```

### 11.4 E2Eテスト（手動）

1. ローカルでmicroblogを起動
2. 投稿を作成し、リプライでスレッドを構築
3. 以下の操作を確認：
   - 記事作成（下書き）
   - 記事公開（ActivityPub配信ログを確認）
   - 記事非公開化（Delete Activity配信を確認）
   - 記事削除
4. rootPost削除時にArticleも削除されることを確認

---

## 改訂履歴

| 日付       | バージョン | 変更内容 |
| ---------- | ---------- | -------- |
| 2026-01-23 | 1.0        | 初版作成 |
