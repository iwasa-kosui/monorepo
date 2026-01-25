# ADR-002: 集約独立性の確保 - カスケード削除の廃止

## ステータス

承認済み（Accepted）

## 日付

2026-01-25

## コンテキスト

### 現状の問題

`apps/microblog` では、1つのユースケースで複数の集約を操作する設計になっていた。

| ユースケース | 操作集約数 | 問題点 |
|-------------|----------|--------|
| `deletePost.ts` | 9 | 投稿削除時に関連する通知・タイムラインアイテム等をカスケード削除 |
| `removeReceivedLike.ts` | 2 | Like削除時にLikeNotificationも削除 |
| `removeReceivedRepost.ts` | 2 | Repost削除時にTimelineItemも削除 |
| `removeReceivedEmojiReact.ts` | 2 | EmojiReact削除時にEmojiReactNotificationも削除 |

### DDDにおける原則

CLAUDE.mdに記載の通り、集約間の操作は以下の原則に従うべきである：

1. **集約間はID参照のみ** - 直接的なオブジェクト参照は禁止
2. **ストアは自身の集約のみを操作** - 他の集約のデータを直接削除・変更してはいけない
3. **カスケード削除はユースケース層で実装** - 必要な場合のみ

しかし、カスケード削除自体がそもそも本当に必要かを再検討した結果、多くのケースで不要であることが判明した。

---

## 決定

### 方針

**カスケード削除を廃止し、参照時のフィルタリングで対応する。**

具体的には：

1. 投稿が削除されても、その投稿を参照する通知・タイムラインアイテムは削除しない
2. リゾルバー（読み取り処理）で `innerJoin` + `deletedAt IS NULL` を使用し、削除済み投稿を参照するアイテムを結果から除外する
3. ユーザーには削除された投稿を参照するアイテムは単純に表示しない（「削除されました」の表示も不要）

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
  await articleDeletedStore.store(Article.deleteArticle(now)(article.articleId));
}
```

#### 2. リゾルバーでのフィルタリング

**通知リゾルバー:**
```typescript
// innerJoin で投稿を結合し、deletedAt IS NULL でフィルタ
.innerJoin(postsTable, eq(notificationLikesTable.likedPostId, postsTable.postId))
.where(and(
  eq(notificationsTable.recipientUserId, userId),
  isNull(postsTable.deletedAt)
))
```

**タイムラインリゾルバー:**
```typescript
// innerJoin で投稿を結合し、deletedAt IS NULL でフィルタ
.innerJoin(postsTable, eq(timelineItemsTable.postId, postsTable.postId))
.where(and(
  inArray(timelineItemsTable.actorId, actorIds),
  isNull(timelineItemsTable.deletedAt),
  isNull(postsTable.deletedAt)
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

4. **データの追跡可能性が向上**
   - 削除された投稿への参照履歴が残る
   - 監査やデバッグ時に有用

### デメリット

1. **データ増加**
   - 削除済み投稿を参照するデータは残り続ける
   - 必要に応じて定期クリーンアップジョブを検討（別タスク）

2. **クエリのオーバーヘッド**
   - JOINと `deletedAt IS NULL` のフィルタが必要
   - ただし、インデックスを適切に設定すればパフォーマンス影響は軽微

---

## 影響を受けるファイル

### リゾルバー
- `src/adaptor/pg/notification/notificationsResolverByUserId.ts`
- `src/adaptor/pg/timeline/timelineItemsResolverByActorIds.ts`

### ドメインモデル
- `src/domain/notification/notification.ts`
- `src/domain/timeline/timelineItem.ts`

### ユースケース
- `src/useCase/deletePost.ts`
- `src/useCase/removeReceivedLike.ts`
- `src/useCase/removeReceivedRepost.ts`
- `src/useCase/removeReceivedEmojiReact.ts`

### UI
- `src/ui/pages/home.tsx`
- `src/ui/hooks/useKeyboardNavigation.ts`
- `src/adaptor/routes/apiRouter.tsx`

---

## 代替案

### 案1: 結果整合性によるカスケード削除

イベント駆動設計でカスケード削除を実装する案も検討した。

```
Post削除 → PostDeleted イベント発行
         → TimelineItem削除ハンドラ
         → LikeNotification削除ハンドラ
         → ...
```

**却下理由:**
- 複雑性が増す
- そもそも削除する必要がない
- 参照時のフィルタリングの方がシンプル

### 案2: 削除済み表示

`leftJoin` を使用し、削除された投稿を参照するアイテムには「この投稿は削除されました」と表示する案。

**却下理由:**
- ユーザーにとって削除されたことを知らせる必要がない
- UIが複雑になる
- `innerJoin` でフィルタする方がシンプル

---

## 参考資料

- [CLAUDE.md - 集約境界の規則](../../../CLAUDE.md)
- [Domain-Driven Design Reference](https://www.domainlanguage.com/ddd/reference/)
