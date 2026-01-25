# ADR-002: 集約独立性の確保 - カスケード削除の廃止

## ステータス

承認済み（Accepted）

## 日付

2026-01-25

## コンテキスト

### 現状の問題

`apps/microblog` では、1つのユースケースで複数の集約を操作する設計になっていた。

| ユースケース                  | 操作集約数 | 問題点                                                           |
| ----------------------------- | ---------- | ---------------------------------------------------------------- |
| `deletePost.ts`               | 9          | 投稿削除時に関連する通知・タイムラインアイテム等をカスケード削除 |
| `removeReceivedLike.ts`       | 2          | Like削除時にLikeNotificationも削除                               |
| `removeReceivedRepost.ts`     | 2          | Repost削除時にTimelineItemも削除                                 |
| `removeReceivedEmojiReact.ts` | 2          | EmojiReact削除時にEmojiReactNotificationも削除                   |

### DDDにおける原則

CLAUDE.mdに記載の通り、集約間の操作は以下の原則に従うべきである：

1. **集約間はID参照のみ** - 直接的なオブジェクト参照は禁止
2. **ストアは自身の集約のみを操作** - 他の集約のデータを直接削除・変更してはいけない
3. **カスケード削除はユースケース層で実装** - 必要な場合のみ

しかし、カスケード削除自体がそもそも本当に必要かを再検討した結果、多くのケースで不要であることが判明した。

---

## 決定

### 方針

**カスケード削除を廃止し、物理削除 + `innerJoin` による自動フィルタリングで対応する。**

具体的には：

1. 投稿は物理削除（DELETEクエリ）で完全に削除する
2. 投稿を参照する通知・タイムラインアイテムは削除しない
3. リゾルバー（読み取り処理）は `innerJoin` で投稿を結合するため、削除済み投稿を参照するアイテムは自動的に結果から除外される
4. 返信通知については、返信先（元投稿）が削除されても通知を表示する（`leftJoin` を使用）

### 変更内容

#### 1. ユースケースの簡素化

**Before（deletePost.ts - 9集約を操作）:**

```typescript
// 関連エンティティを並列で取得して削除
const [timelineItemResult, likeNotificationsResult, ...] = await Promise.all([...]);
await Promise.all([
  timelineItemDeletedStore.store(...),
  likeNotificationDeletedStore.store(...),
  ...
]);
```

**After（deletePost.ts - 2集約のみ）:**

```typescript
// Post と Article（子集約）のみを削除
await postDeletedStore.store(Post.deletePost(now)(postId));
if (article) {
  await articleDeletedStore.store(
    Article.deleteArticle(now)(article.articleId),
  );
}
```

#### 2. 物理削除の実装

投稿は `deletedAt` による論理削除ではなく、物理削除（DELETE）を使用する。

```typescript
// postDeletedStore.ts
await tx.delete(postImagesTable).where(eq(postImagesTable.postId, postId));
await tx.delete(localPostsTable).where(eq(localPostsTable.postId, postId));
await tx.delete(remotePostsTable).where(eq(remotePostsTable.postId, postId));
await tx.delete(postsTable).where(eq(postsTable.postId, postId));
```

#### 3. リゾルバーでの自動フィルタリング

`innerJoin` を使用することで、削除済み投稿を参照するアイテムは自動的に除外される。

**通知リゾルバー（Like/EmojiReact）:**

```typescript
// innerJoin により、削除済み投稿を参照する通知は自動的に除外
.innerJoin(postsTable, eq(notificationLikesTable.likedPostId, postsTable.postId))
.where(eq(notificationsTable.recipientUserId, userId))
```

**通知リゾルバー（Reply）:**

```typescript
// 返信投稿は innerJoin（削除されていれば除外）
.innerJoin(replyPostsAlias, eq(notificationRepliesTable.replyPostId, replyPostsAlias.postId))
// 返信先投稿は leftJoin（削除されていても通知を表示）
.leftJoin(originalPostsAlias, eq(notificationRepliesTable.originalPostId, originalPostsAlias.postId))
```

**タイムラインリゾルバー:**

```typescript
// innerJoin により、削除済み投稿を参照するタイムラインアイテムは自動的に除外
.innerJoin(postsTable, eq(timelineItemsTable.postId, postsTable.postId))
.where(and(
  inArray(timelineItemsTable.actorId, actorIds),
  isNull(timelineItemsTable.deletedAt),
))
```

---

## 結果

### メリット

1. **ユースケースがシンプルになる**
   - `deletePost.ts`: 9集約 → 2集約
   - `removeReceivedLike.ts`: 2集約 → 1集約
   - `removeReceivedRepost.ts`: 2集約 → 1集約
   - `removeReceivedEmojiReact.ts`: 2集約 → 1集約

2. **集約間の結合度が下がる**
   - 各ユースケースは自身の集約のみを操作
   - 他の集約の内部構造を知る必要がない

3. **結果整合性の問題が発生しない**
   - カスケード削除中の障害でデータ不整合が起きるリスクがない
   - トランザクション境界を狭く保てる

4. **クエリがシンプル**
   - `deletedAt IS NULL` のフィルタが不要
   - `innerJoin` による自然な除外

### デメリット

1. **孤児レコードの発生**
   - 削除済み投稿を参照する通知・タイムラインアイテムは残り続ける
   - 必要に応じて定期クリーンアップジョブを検討（別タスク）

---

## 影響を受けるファイル

### リゾルバー

- `src/adaptor/pg/notification/notificationsResolverByUserId.ts`
- `src/adaptor/pg/timeline/timelineItemsResolverByActorIds.ts`

### ドメインモデル

- `src/domain/notification/notification.ts`（`originalPost` を optional に変更）

### ユースケース

- `src/useCase/deletePost.ts`
- `src/useCase/removeReceivedLike.ts`
- `src/useCase/removeReceivedRepost.ts`
- `src/useCase/removeReceivedEmojiReact.ts`

---

## 代替案

### 案1: 論理削除 + deletedAt フィルタ

`deletedAt` カラムを使用した論理削除で、クエリ時に `deletedAt IS NULL` でフィルタする案。

**却下理由:**

- 物理削除の方がストレージ効率が良い
- `innerJoin` による自動フィルタの方がシンプル
- クエリ時の明示的なフィルタが不要

### 案2: 結果整合性によるカスケード削除

イベント駆動設計でカスケード削除を実装する案。

```
Post削除 → PostDeleted イベント発行
         → TimelineItem削除ハンドラ
         → LikeNotification削除ハンドラ
         → ...
```

**却下理由:**

- 複雑性が増す
- そもそも削除する必要がない
- `innerJoin` による自動フィルタの方がシンプル

---

## 参考資料

- [CLAUDE.md - 集約境界の規則](../../../CLAUDE.md)
- [Domain-Driven Design Reference](https://www.domainlanguage.com/ddd/reference/)
