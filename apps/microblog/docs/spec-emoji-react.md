# EmojiReact（絵文字リアクション）対応 仕様書

## 1. 概要

### 1.1 背景

現在、microblogアプリケーションは`Like`（いいね）のみをサポートしていますが、Fediverse（Mastodon、Misskey、Pleroma、Mitraなど）では絵文字リアクション機能が広く使われています。

以下のログが示すように、他のActivityPubサーバーから`EmojiReact`アクティビティが送信される可能性があります：

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "litepub": "http://litepub.social/ns#",
      "toot": "http://joinmastodon.org/ns#",
      "Emoji": "toot:Emoji",
      "EmojiReact": "litepub:EmojiReact"
    }
  ]
}
```

### 1.2 目的

- 他のサーバーからの`EmojiReact`アクティビティを受信・処理できるようにする
- ローカルユーザーが絵文字リアクションを送信できるようにする
- リアクションを受け取ったユーザーに通知を送信する

### 1.3 スコープ

| 項目 | 対応 |
|------|------|
| Unicode絵文字リアクション受信 | ✓ |
| Unicode絵文字リアクション送信 | ✓ |
| リアクション通知 | ✓ |
| カスタム絵文字（toot:Emoji）受信 | Phase 2 |
| カスタム絵文字（toot:Emoji）送信 | Phase 2 |

---

## 2. ActivityPub EmojiReact仕様

### 2.1 EmojiReactアクティビティ

`EmojiReact`は`litepub`拡張で定義されたアクティビティタイプです。

**受信例（Unicode絵文字）：**

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "litepub": "http://litepub.social/ns#",
      "EmojiReact": "litepub:EmojiReact"
    }
  ],
  "type": "EmojiReact",
  "id": "https://example.com/activities/react/123",
  "actor": "https://example.com/users/alice",
  "object": "https://blog.kosui.me/users/kosui/posts/abc123",
  "content": "👍"
}
```

**受信例（カスタム絵文字）：**

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    {
      "litepub": "http://litepub.social/ns#",
      "toot": "http://joinmastodon.org/ns#",
      "Emoji": "toot:Emoji",
      "EmojiReact": "litepub:EmojiReact"
    }
  ],
  "type": "EmojiReact",
  "id": "https://example.com/activities/react/456",
  "actor": "https://example.com/users/bob",
  "object": "https://blog.kosui.me/users/kosui/posts/abc123",
  "content": ":blobcat:",
  "tag": [
    {
      "type": "Emoji",
      "name": ":blobcat:",
      "icon": {
        "type": "Image",
        "url": "https://example.com/emoji/blobcat.png",
        "mediaType": "image/png"
      }
    }
  ]
}
```

### 2.2 Undo EmojiReact

リアクションの取り消しは`Undo`アクティビティで行います。

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Undo",
  "id": "https://example.com/activities/undo/789",
  "actor": "https://example.com/users/alice",
  "object": {
    "type": "EmojiReact",
    "id": "https://example.com/activities/react/123",
    "actor": "https://example.com/users/alice",
    "object": "https://blog.kosui.me/users/kosui/posts/abc123",
    "content": "👍"
  }
}
```

### 2.3 Fedifyでの対応

Fedify v1.4.0以降で以下の機能がサポートされています：

- `Undo`クラスのデフォルトコンテキストに`litepub:EmojiReact`が追加
- `Object.emojiReactions`プロパティ
- `Object.getEmojiReactions()`メソッド

**注意**: FedifyはネイティブのEmojiReactクラスを提供していないため、カスタムアクティビティとして処理する必要があります。

---

## 3. ドメインモデル設計

### 3.1 EmojiReact集約

新しい集約`EmojiReact`を追加します。

```
apps/microblog/src/domain/emojiReact/
├── emojiReact.ts        # 集約定義
├── emojiReactId.ts      # ID型
├── emoji.ts             # 絵文字値オブジェクト
└── index.ts             # エクスポート
```

### 3.2 型定義

**EmojiReactId（`emojiReactId.ts`）：**

```typescript
import { z } from 'zod';
import { randomUUID } from 'crypto';

const EmojiReactIdSym = Symbol('EmojiReactId');
const EmojiReactIdSchema = z.string().uuid().brand(EmojiReactIdSym).describe('EmojiReactId');
export type EmojiReactId = z.infer<typeof EmojiReactIdSchema>;

export const EmojiReactId = {
  schema: EmojiReactIdSchema,
  generate: (): EmojiReactId => randomUUID() as EmojiReactId,
  parse: (data: unknown): Result<EmojiReactId, ValidationError> => {
    const result = EmojiReactIdSchema.safeParse(data);
    return result.success ? ok(result.data) : err(new ValidationError(result.error));
  },
  orThrow: (data: unknown): EmojiReactId => EmojiReactIdSchema.parse(data),
} as const;
```

**Emoji値オブジェクト（`emoji.ts`）：**

```typescript
import { z } from 'zod';

// Unicode絵文字の正規表現（簡易版）
const UNICODE_EMOJI_PATTERN = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})+$/u;
// カスタム絵文字のパターン（:name:形式）
const CUSTOM_EMOJI_PATTERN = /^:[a-zA-Z0-9_]+:$/;

const EmojiSym = Symbol('Emoji');

// Phase 1: Unicode絵文字のみ
const UnicodeEmojiSchema = z.string()
  .regex(UNICODE_EMOJI_PATTERN, 'Invalid unicode emoji')
  .brand(EmojiSym)
  .describe('UnicodeEmoji');

export type UnicodeEmoji = z.infer<typeof UnicodeEmojiSchema>;

// Phase 2: カスタム絵文字
const CustomEmojiSchema = z.object({
  shortcode: z.string().regex(CUSTOM_EMOJI_PATTERN),
  url: z.string().url(),
  mediaType: z.string().optional(),
}).brand(EmojiSym).describe('CustomEmoji');

export type CustomEmoji = z.infer<typeof CustomEmojiSchema>;

// 統合Emoji型（Phase 2用）
export type Emoji = UnicodeEmoji | CustomEmoji;

export const Emoji = {
  unicodeSchema: UnicodeEmojiSchema,
  customSchema: CustomEmojiSchema,

  parseUnicode: (data: unknown): Result<UnicodeEmoji, ValidationError> => {
    const result = UnicodeEmojiSchema.safeParse(data);
    return result.success ? ok(result.data) : err(new ValidationError(result.error));
  },

  isUnicode: (emoji: Emoji): emoji is UnicodeEmoji => {
    return typeof emoji === 'string';
  },

  isCustom: (emoji: Emoji): emoji is CustomEmoji => {
    return typeof emoji === 'object' && 'shortcode' in emoji;
  },

  // 表示用文字列を取得
  toString: (emoji: Emoji): string => {
    return Emoji.isUnicode(emoji) ? emoji : emoji.shortcode;
  },
} as const;
```

**EmojiReact集約（`emojiReact.ts`）：**

```typescript
import { z } from 'zod';
import { EmojiReactId } from './emojiReactId.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent } from '../aggregate/aggregateEvent.ts';

// 集約スキーマ
const EmojiReactSchema = z.object({
  emojiReactId: EmojiReactId.schema,
  actorId: ActorId.schema,
  objectUri: z.string().url(),
  emoji: z.string(),  // Unicode絵文字またはショートコード
  emojiReactActivityUri: z.string().url().nullable(),
}).describe('EmojiReact');

export type EmojiReact = z.infer<typeof EmojiReactSchema>;

// 集約ID型
type EmojiReactAggregateId = { emojiReactId: EmojiReactId };
type EmojiReactAggregate = {
  aggregateId: EmojiReactAggregateId;
  aggregateName: 'emojiReact';
  aggregateState: EmojiReact;
};

const EmojiReactEvent = AggregateEvent.createFactory<EmojiReactAggregate>('emojiReact');

// イベント型
export type EmojiReactCreated = ReturnType<typeof EmojiReactEvent.create<
  EmojiReact,
  'emojiReact.emojiReactCreated',
  EmojiReact
>>;

export type EmojiReactDeleted = ReturnType<typeof EmojiReactEvent.create<
  undefined,
  'emojiReact.emojiReactDeleted',
  { emojiReactActivityUri: string }
>>;

// ファクトリ
export const EmojiReact = {
  schema: EmojiReactSchema,

  createEmojiReact: (
    payload: {
      actorId: ActorId;
      objectUri: string;
      emoji: string;
      emojiReactActivityUri: string | null;
    },
    now: Instant,
  ): EmojiReactCreated => {
    const emojiReactId = EmojiReactId.generate();
    const emojiReact: EmojiReact = {
      emojiReactId,
      actorId: payload.actorId,
      objectUri: payload.objectUri,
      emoji: payload.emoji,
      emojiReactActivityUri: payload.emojiReactActivityUri,
    };
    return EmojiReactEvent.create(
      { emojiReactId },
      emojiReact,
      'emojiReact.emojiReactCreated',
      emojiReact,
      now,
    );
  },

  deleteEmojiReact: (
    emojiReact: EmojiReact,
    now: Instant,
  ): EmojiReactDeleted => {
    return EmojiReactEvent.create(
      { emojiReactId: emojiReact.emojiReactId },
      undefined,
      'emojiReact.emojiReactDeleted',
      { emojiReactActivityUri: emojiReact.emojiReactActivityUri ?? '' },
      now,
    );
  },

  fromEvent: (event: EmojiReactCreated): EmojiReact => {
    return event.aggregateState;
  },
} as const;
```

### 3.3 Notification拡張

既存の`Notification`にリアクション通知型を追加します。

```typescript
// domain/notification/notification.ts に追加

export type EmojiReactNotification = Readonly<{
  type: 'emojiReact';
  notificationId: NotificationId;
  recipientUserId: UserId;
  isRead: boolean;
  reactorActorId: ActorId;
  reactedPostId: PostId;
  emoji: string;
  createdAt: Instant;
}>;

// 統合型を更新
export type Notification =
  | LikeNotification
  | FollowNotification
  | EmojiReactNotification;
```

---

## 4. データベーススキーマ

### 4.1 emoji_reactsテーブル

```sql
CREATE TABLE emoji_reacts (
  emoji_react_id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES actors(actor_id),
  object_uri TEXT NOT NULL,
  emoji VARCHAR(128) NOT NULL,
  emoji_react_activity_uri TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,

  -- 同じアクターは同じ対象に同じ絵文字は1回のみ
  UNIQUE (actor_id, object_uri, emoji)
);

CREATE INDEX idx_emoji_reacts_object_uri ON emoji_reacts(object_uri);
CREATE INDEX idx_emoji_reacts_actor_id ON emoji_reacts(actor_id);
```

### 4.2 notification_emoji_reactsテーブル

```sql
CREATE TABLE notification_emoji_reacts (
  notification_id UUID PRIMARY KEY REFERENCES notifications(notification_id) ON DELETE CASCADE,
  reactor_actor_id UUID NOT NULL REFERENCES actors(actor_id),
  reacted_post_id UUID NOT NULL,
  emoji VARCHAR(128) NOT NULL
);

CREATE INDEX idx_notification_emoji_reacts_post ON notification_emoji_reacts(reacted_post_id);
```

### 4.3 Drizzle ORMスキーマ

```typescript
// adaptor/pg/schema.ts に追加

export const emojiReactsTable = pgTable(
  'emoji_reacts',
  {
    emojiReactId: uuid('emoji_react_id').primaryKey(),
    actorId: uuid('actor_id').notNull().references(() => actorsTable.actorId),
    objectUri: text('object_uri').notNull(),
    emoji: varchar('emoji', { length: 128 }).notNull(),
    emojiReactActivityUri: text('emoji_react_activity_uri').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    uniqueReaction: unique().on(table.actorId, table.objectUri, table.emoji),
    objectUriIdx: index('idx_emoji_reacts_object_uri').on(table.objectUri),
    actorIdIdx: index('idx_emoji_reacts_actor_id').on(table.actorId),
  }),
);

export const notificationEmojiReactsTable = pgTable(
  'notification_emoji_reacts',
  {
    notificationId: uuid('notification_id')
      .primaryKey()
      .references(() => notificationsTable.notificationId, { onDelete: 'cascade' }),
    reactorActorId: uuid('reactor_actor_id').notNull().references(() => actorsTable.actorId),
    reactedPostId: uuid('reacted_post_id').notNull(),
    emoji: varchar('emoji', { length: 128 }).notNull(),
  },
  (table) => ({
    postIdx: index('idx_notification_emoji_reacts_post').on(table.reactedPostId),
  }),
);
```

---

## 5. イベント設計

### 5.1 ドメインイベント一覧

| イベント名 | 発火条件 | aggregateState |
|-----------|---------|----------------|
| `emojiReact.emojiReactCreated` | リアクション作成（受信/送信） | `EmojiReact` |
| `emojiReact.emojiReactDeleted` | リアクション削除（Undo） | `undefined` |
| `notification.emojiReactNotificationCreated` | リアクション通知作成 | `EmojiReactNotification` |
| `notification.emojiReactNotificationDeleted` | リアクション通知削除 | `undefined` |

### 5.2 イベントフロー

**リアクション受信時：**

```
[RemoteServer] --EmojiReact--> [Inbox Handler]
                                    |
                                    v
                         +-------------------+
                         | EmojiReactCreated |
                         +-------------------+
                                    |
                                    v
                   +--------------------------------+
                   | EmojiReactNotificationCreated  |
                   +--------------------------------+
                                    |
                                    v
                         +-------------------+
                         |   Web Push送信    |
                         +-------------------+
```

**リアクション取り消し時：**

```
[RemoteServer] --Undo(EmojiReact)--> [Inbox Handler]
                                          |
                                          v
                               +-------------------+
                               | EmojiReactDeleted |
                               +-------------------+
                                          |
                                          v
                   +--------------------------------+
                   | EmojiReactNotificationDeleted  |
                   +--------------------------------+
```

---

## 6. ストア/リゾルバー

### 6.1 ディレクトリ構造

```
apps/microblog/src/adaptor/pg/emojiReact/
├── emojiReactCreatedStore.ts
├── emojiReactDeletedStore.ts
├── emojiReactResolverByActivityUri.ts
├── emojiReactResolverByActorAndObject.ts
├── emojiReactsResolverByObjectUri.ts
└── index.ts
```

### 6.2 Store実装

**EmojiReactCreatedStore：**

```typescript
type EmojiReactCreatedStore = Store<EmojiReactCreated>;

const create = (): EmojiReactCreatedStore => ({
  store: async (...events): RA<void, never> => {
    await DB.getInstance().transaction(async (tx) => {
      for (const event of events) {
        await tx.insert(emojiReactsTable).values({
          emojiReactId: event.aggregateState.emojiReactId,
          actorId: event.aggregateState.actorId,
          objectUri: event.aggregateState.objectUri,
          emoji: event.aggregateState.emoji,
          emojiReactActivityUri: event.aggregateState.emojiReactActivityUri,
          createdAt: new Date(event.occurredAt),
        });
        await tx.insert(domainEventsTable).values({
          eventId: event.eventId,
          aggregateId: JSON.stringify(event.aggregateId),
          aggregateName: event.aggregateName,
          aggregateState: JSON.stringify(event.aggregateState),
          eventName: event.eventName,
          eventPayload: JSON.stringify(event.eventPayload),
          occurredAt: new Date(event.occurredAt),
        });
      }
    });
    return RA.ok(undefined);
  },
});
```

**EmojiReactDeletedStore：**

```typescript
type EmojiReactDeletedStore = Store<EmojiReactDeleted>;

const create = (): EmojiReactDeletedStore => ({
  store: async (...events): RA<void, never> => {
    await DB.getInstance().transaction(async (tx) => {
      for (const event of events) {
        await tx.delete(emojiReactsTable)
          .where(eq(emojiReactsTable.emojiReactId, event.aggregateId.emojiReactId));
        await tx.insert(domainEventsTable).values({...});
      }
    });
    return RA.ok(undefined);
  },
});
```

### 6.3 Resolver実装

**EmojiReactResolverByActivityUri：**

```typescript
type EmojiReactResolverByActivityUri = Resolver<
  { emojiReactActivityUri: string },
  EmojiReact | undefined
>;

const resolve = async ({ emojiReactActivityUri }): RA<EmojiReact | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(emojiReactsTable)
    .where(eq(emojiReactsTable.emojiReactActivityUri, emojiReactActivityUri))
    .limit(1);

  if (result.length === 0) return RA.ok(undefined);

  return RA.ok({
    emojiReactId: EmojiReactId.orThrow(result[0].emojiReactId),
    actorId: ActorId.orThrow(result[0].actorId),
    objectUri: result[0].objectUri,
    emoji: result[0].emoji,
    emojiReactActivityUri: result[0].emojiReactActivityUri,
  });
};
```

**EmojiReactsResolverByObjectUri（投稿に対するリアクション一覧取得）：**

```typescript
type EmojiReactsResolverByObjectUri = Resolver<
  { objectUri: string },
  ReadonlyArray<EmojiReact>
>;

const resolve = async ({ objectUri }): RA<ReadonlyArray<EmojiReact>, never> => {
  const results = await DB.getInstance()
    .select()
    .from(emojiReactsTable)
    .where(eq(emojiReactsTable.objectUri, objectUri));

  return RA.ok(results.map(row => ({
    emojiReactId: EmojiReactId.orThrow(row.emojiReactId),
    actorId: ActorId.orThrow(row.actorId),
    objectUri: row.objectUri,
    emoji: row.emoji,
    emojiReactActivityUri: row.emojiReactActivityUri,
  })));
};
```

---

## 7. ユースケース

### 7.1 ディレクトリ構造

```
apps/microblog/src/useCase/
├── addReceivedEmojiReact.ts      # リアクション受信
├── removeReceivedEmojiReact.ts   # リアクション削除（Undo）
├── sendEmojiReact.ts             # リアクション送信
└── undoEmojiReact.ts             # リアクション取り消し
```

### 7.2 AddReceivedEmojiReact

```typescript
type Input = Readonly<{
  emojiReactActivityUri: string;
  reactedPostId: PostId;
  reactorIdentity: ActorIdentity;
  objectUri: string;
  emoji: string;
}>;

type Output = EmojiReact;
type Err =
  | AlreadyReactedError
  | LocalPostNotFoundError;

const run = (input: Input): RA<Output, Err> => {
  return RA.flow(
    RA.ok(input),
    // 1. 既存のリアクションを確認
    RA.andBind('existingReact', ({ emojiReactActivityUri }) =>
      emojiReactResolverByActivityUri.resolve({ emojiReactActivityUri }),
    ),
    RA.andThen(({ existingReact }) =>
      existingReact ? RA.err(new AlreadyReactedError()) : RA.ok(undefined),
    ),
    // 2. 対象の投稿を確認
    RA.andBind('post', ({ reactedPostId }) =>
      localPostResolver.resolve({ postId: reactedPostId }),
    ),
    RA.andThen(({ post }) =>
      post ? RA.ok(undefined) : RA.err(new LocalPostNotFoundError()),
    ),
    // 3. リモートアクターをupsert
    RA.andBind('actor', ({ reactorIdentity }) =>
      remoteActorUpsert.upsert(reactorIdentity),
    ),
    // 4. EmojiReactを作成・保存
    RA.andBind('event', (ctx) => {
      const event = EmojiReact.createEmojiReact({
        actorId: ctx.actor.actorId,
        objectUri: ctx.objectUri,
        emoji: ctx.emoji,
        emojiReactActivityUri: ctx.emojiReactActivityUri,
      }, Instant.now());
      return emojiReactCreatedStore.store(event).map(() => event);
    }),
    // 5. 通知を作成
    RA.andThrough(({ event, post }) => {
      const notification = Notification.createEmojiReactNotification({
        recipientUserId: post.authorUserId,
        reactorActorId: event.aggregateState.actorId,
        reactedPostId: post.postId,
        emoji: event.aggregateState.emoji,
      }, Instant.now());
      return emojiReactNotificationCreatedStore.store(notification);
    }),
    // 6. Web Push送信
    RA.andThrough(({ post, actor, emoji }) =>
      webPushSender.send({
        userId: post.authorUserId,
        title: `${actor.displayName} reacted with ${emoji}`,
        body: post.content.substring(0, 100),
      }),
    ),
    RA.map(({ event }) => EmojiReact.fromEvent(event)),
  );
};
```

### 7.3 RemoveReceivedEmojiReact

```typescript
type Input = Readonly<{
  emojiReactActivityUri: string;
}>;

const run = (input: Input): RA<void, EmojiReactNotFoundError> => {
  return RA.flow(
    RA.ok(input),
    // 1. リアクションを検索
    RA.andBind('emojiReact', ({ emojiReactActivityUri }) =>
      emojiReactResolverByActivityUri.resolve({ emojiReactActivityUri }),
    ),
    RA.andThen(({ emojiReact }) =>
      emojiReact ? RA.ok({ emojiReact }) : RA.err(new EmojiReactNotFoundError()),
    ),
    // 2. 関連する通知を検索・削除
    RA.andThrough(({ emojiReact }) =>
      emojiReactNotificationResolverByReact.resolve({
        reactorActorId: emojiReact.actorId,
        emoji: emojiReact.emoji,
      }).andThen((notification) => {
        if (!notification) return RA.ok(undefined);
        const event = Notification.deleteEmojiReactNotification(notification, Instant.now());
        return emojiReactNotificationDeletedStore.store(event);
      }),
    ),
    // 3. リアクションを削除
    RA.andThrough(({ emojiReact }) => {
      const event = EmojiReact.deleteEmojiReact(emojiReact, Instant.now());
      return emojiReactDeletedStore.store(event);
    }),
    RA.map(() => undefined),
  );
};
```

### 7.4 SendEmojiReact

```typescript
type Input = Readonly<{
  sessionId: SessionId;
  objectUri: string;
  emoji: string;
  request: Request;
  ctx: RequestContext<unknown>;
}>;

const run = (input: Input): RA<EmojiReact, SendEmojiReactError> => {
  return RA.flow(
    RA.ok(input),
    // 1. セッション → ユーザー → ローカルアクター解決
    RA.andBind('session', ({ sessionId }) => sessionResolver.resolve({ sessionId })),
    RA.andBind('user', ({ session }) => userResolver.resolve({ userId: session.userId })),
    RA.andBind('localActor', ({ user }) => localActorResolver.resolve({ userId: user.userId })),
    // 2. 既存のリアクションを確認
    RA.andBind('existingReact', ({ localActor, objectUri, emoji }) =>
      emojiReactResolverByActorAndObject.resolve({
        actorId: localActor.actorId,
        objectUri,
        emoji,
      }),
    ),
    RA.andThen(({ existingReact }) =>
      existingReact ? RA.err(new AlreadyReactedError()) : RA.ok(undefined),
    ),
    // 3. リモートNoteを取得
    RA.andBind('remoteNote', ({ objectUri, ctx }) =>
      ctx.lookupObject(objectUri).then((obj) =>
        obj instanceof Note ? RA.ok(obj) : RA.err(new InvalidObjectError()),
      ),
    ),
    // 4. EmojiReactを作成・保存
    RA.andBind('event', (ctx) => {
      const event = EmojiReact.createEmojiReact({
        actorId: ctx.localActor.actorId,
        objectUri: ctx.objectUri,
        emoji: ctx.emoji,
        emojiReactActivityUri: null, // ローカル送信時はnull
      }, Instant.now());
      return emojiReactCreatedStore.store(event).map(() => event);
    }),
    // 5. EmojiReactアクティビティを送信
    RA.andThrough(async ({ ctx, localActor, remoteNote, emoji }) => {
      // カスタムアクティビティとして送信
      await ctx.sendActivity(
        { identifier: localActor.username },
        remoteNote.attributedTo,
        new Activity({
          type: 'EmojiReact',
          actor: localActor.actorUri,
          object: remoteNote.id,
          content: emoji,
        }),
      );
      return RA.ok(undefined);
    }),
    RA.map(({ event }) => EmojiReact.fromEvent(event)),
  );
};
```

---

## 8. ActivityPub連携

### 8.1 Inbox Handler

**onEmojiReact.ts：**

```typescript
// adaptor/fedify/inboxListener/onEmojiReact.ts

export const onEmojiReact = async (
  ctx: Context<unknown>,
  activity: Activity,
): Promise<void> => {
  const logger = getLogger();

  // 1. EmojiReactアクティビティかを確認
  const activityJson = await activity.toJsonLd();
  if (activityJson.type !== 'EmojiReact') {
    return;
  }

  // 2. 必要なフィールドを抽出
  const activityUri = activity.id?.href;
  const actorUri = activity.actorId?.href;
  const objectUri = typeof activityJson.object === 'string'
    ? activityJson.object
    : activityJson.object?.id;
  const emoji = activityJson.content;

  if (!activityUri || !actorUri || !objectUri || !emoji) {
    logger.warn('Invalid EmojiReact activity: missing required fields');
    return;
  }

  // 3. 対象がローカルのNoteかを確認
  const postId = extractLocalPostId(objectUri);
  if (!postId) {
    logger.debug('EmojiReact target is not a local post');
    return;
  }

  // 4. アクターを解決
  const actor = await ctx.lookupObject(actorUri);
  if (!actor || !(actor instanceof Person || actor instanceof Service)) {
    logger.warn('Failed to lookup actor');
    return;
  }

  // 5. ユースケースを実行
  const useCase = AddReceivedEmojiReactUseCase.getInstance();
  await useCase.run({
    emojiReactActivityUri: activityUri,
    reactedPostId: PostId.orThrow(postId),
    reactorIdentity: {
      actorUri,
      handle: actor.preferredUsername ?? '',
      displayName: actor.name?.toString() ?? '',
      avatarUrl: actor.icon?.url?.href ?? null,
    },
    objectUri,
    emoji,
  });
};
```

### 8.2 Undo Handler拡張

**onUndo.ts に追加：**

```typescript
// adaptor/fedify/inboxListener/onUndo.ts に追加

const handleUndoEmojiReact = async (
  ctx: Context<unknown>,
  undoActivity: Undo,
  innerActivity: Activity,
): Promise<void> => {
  const activityJson = await innerActivity.toJsonLd();
  if (activityJson.type !== 'EmojiReact') {
    return;
  }

  const activityUri = innerActivity.id?.href;
  if (!activityUri) {
    return;
  }

  const useCase = RemoveReceivedEmojiReactUseCase.getInstance();
  await useCase.run({ emojiReactActivityUri: activityUri });
};

// onUndo関数内で呼び出し
export const onUndo = async (
  ctx: Context<unknown>,
  undo: Undo,
): Promise<void> => {
  const object = await undo.getObject();

  // ... 既存のハンドラー ...

  // EmojiReactのUndo処理を追加
  if (object instanceof Activity) {
    await handleUndoEmojiReact(ctx, undo, object);
  }
};
```

### 8.3 Federation設定更新

**federation.ts：**

```typescript
// PRELOADED_CONTEXTSにlitepubを追加
const PRELOADED_CONTEXTS: Record<string, object> = {
  'http://joinmastodon.org/ns': { /* 既存 */ },
  'https://joinmastodon.org/ns': { /* 既存 */ },
  'http://litepub.social/ns': {
    '@context': {
      'litepub': 'http://litepub.social/ns#',
      'EmojiReact': 'litepub:EmojiReact',
    },
  },
};

// カスタムアクティビティの処理を追加
// 注: Fedifyのon()はネイティブタイプのみサポートのため、
// 汎用ハンドラーで処理する必要がある
federation
  .setInboxListeners('/users/{identifier}/inbox', '/inbox')
  .setSharedKeyDispatcher(sharedKeyDispatcher.dispatch)
  .on(Follow, inboxListener.onFollow)
  .on(Undo, inboxListener.onUndo)
  .on(Create, inboxListener.onCreate)
  .on(Delete, inboxListener.onDelete)
  .on(Like, inboxListener.onLike)
  .on(Announce, inboxListener.onAnnounce)
  // EmojiReactはActivity型で受信し、内部でフィルタリング
  .on(Activity, inboxListener.onActivity);
```

---

## 9. 通知統合

### 9.1 通知ドメイン拡張

```typescript
// domain/notification/notification.ts

// 既存の型に追加
export type EmojiReactNotification = Readonly<{
  type: 'emojiReact';
  notificationId: NotificationId;
  recipientUserId: UserId;
  isRead: boolean;
  reactorActorId: ActorId;
  reactedPostId: PostId;
  emoji: string;
  createdAt: Instant;
}>;

export type Notification =
  | LikeNotification
  | FollowNotification
  | EmojiReactNotification;

// ファクトリ追加
export const Notification = {
  // ... 既存 ...

  createEmojiReactNotification: (
    payload: {
      recipientUserId: UserId;
      reactorActorId: ActorId;
      reactedPostId: PostId;
      emoji: string;
    },
    now: Instant,
  ): EmojiReactNotificationCreated => {
    const notificationId = NotificationId.generate();
    const notification: EmojiReactNotification = {
      type: 'emojiReact',
      notificationId,
      recipientUserId: payload.recipientUserId,
      isRead: false,
      reactorActorId: payload.reactorActorId,
      reactedPostId: payload.reactedPostId,
      emoji: payload.emoji,
      createdAt: now,
    };
    return NotificationEvent.create(
      { notificationId },
      notification,
      'notification.emojiReactNotificationCreated',
      notification,
      now,
    );
  },

  deleteEmojiReactNotification: (
    notification: EmojiReactNotification,
    now: Instant,
  ): EmojiReactNotificationDeleted => {
    return NotificationEvent.create(
      { notificationId: notification.notificationId },
      undefined,
      'notification.emojiReactNotificationDeleted',
      { notificationId: notification.notificationId },
      now,
    );
  },
} as const;
```

### 9.2 通知ストア/リゾルバー

```typescript
// adaptor/pg/notification/emojiReactNotificationCreatedStore.ts

const store = async (...events: readonly EmojiReactNotificationCreated[]): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      const notification = event.aggregateState;
      // notificationsテーブル
      await tx.insert(notificationsTable).values({
        notificationId: notification.notificationId,
        recipientUserId: notification.recipientUserId,
        type: 'emojiReact',
        isRead: 0,
        createdAt: new Date(notification.createdAt),
      });
      // notification_emoji_reactsテーブル
      await tx.insert(notificationEmojiReactsTable).values({
        notificationId: notification.notificationId,
        reactorActorId: notification.reactorActorId,
        reactedPostId: notification.reactedPostId,
        emoji: notification.emoji,
      });
      // domain_events
      await tx.insert(domainEventsTable).values({...});
    }
  });
  return RA.ok(undefined);
};
```

---

## 10. 実装タスク

### Phase 1: 基本的なEmojiReact受信

| # | タスク | 優先度 | 依存 |
|---|--------|--------|------|
| 1.1 | ドメインモデル実装（EmojiReact, EmojiReactId） | 高 | - |
| 1.2 | DBマイグレーション（emoji_reacts, notification_emoji_reacts） | 高 | - |
| 1.3 | Drizzle ORMスキーマ追加 | 高 | 1.2 |
| 1.4 | EmojiReactストア/リゾルバー実装 | 高 | 1.1, 1.3 |
| 1.5 | 通知ドメイン拡張（EmojiReactNotification） | 高 | 1.1 |
| 1.6 | 通知ストア/リゾルバー拡張 | 高 | 1.3, 1.5 |
| 1.7 | AddReceivedEmojiReactユースケース | 高 | 1.4, 1.6 |
| 1.8 | RemoveReceivedEmojiReactユースケース | 高 | 1.4, 1.6 |
| 1.9 | Inbox Handler（onEmojiReact） | 高 | 1.7 |
| 1.10 | Undo Handler拡張 | 高 | 1.8 |
| 1.11 | PRELOADED_CONTEXTSにlitepub追加 | 高 | - |
| 1.12 | テスト実装 | 高 | 1.1-1.11 |

### Phase 2: EmojiReact送信

| # | タスク | 優先度 | 依存 |
|---|--------|--------|------|
| 2.1 | SendEmojiReactユースケース | 中 | Phase 1 |
| 2.2 | UndoEmojiReactユースケース | 中 | 2.1 |
| 2.3 | APIエンドポイント（POST /posts/:id/react） | 中 | 2.1 |
| 2.4 | APIエンドポイント（DELETE /posts/:id/react） | 中 | 2.2 |
| 2.5 | フロントエンドUI | 中 | 2.3, 2.4 |

### Phase 3: カスタム絵文字対応

| # | タスク | 優先度 | 依存 |
|---|--------|--------|------|
| 3.1 | CustomEmoji型実装 | 低 | Phase 1 |
| 3.2 | DBスキーマ拡張（カスタム絵文字メタデータ） | 低 | 3.1 |
| 3.3 | カスタム絵文字解析（toot:Emoji tag） | 低 | 3.1 |
| 3.4 | カスタム絵文字表示UI | 低 | 3.3 |

---

## 11. 参考資料

- [Fedify Changelog](https://fedify.dev/changelog) - EmojiReact対応履歴
- [LitePub Protocol](http://litepub.social/) - EmojiReact仕様
- [Mastodon Emoji Reactions PR](https://github.com/mastodon/mastodon/pull/13275) - 参考実装
- [ActivityPub Specification](https://www.w3.org/TR/activitypub/) - 基本仕様

---

## 改訂履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2026-01-18 | 1.0 | 初版作成 |
