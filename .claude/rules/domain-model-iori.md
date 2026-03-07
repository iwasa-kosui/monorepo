---
paths:
  - "apps/iori/**"
---

# ドメインモデル（iori）

## 集約一覧

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

## 集約間の参照関係

```
User → LocalActor, Key, Session, PushSubscription (userId)
Actor → Post, Like, Repost, Notification, Follow (actorId)
Post → Image [1:N], TimelineItem, Repost [1:N], Notification [1:N] (postId)
```

## 主要なドメインイベント

| 集約 | イベント名 | aggregateState |
|-----|-----------|----------------|
| Post | `post.created` / `post.remotePostCreated` / `post.deleted` | `LocalPost` / `RemotePost` / `undefined` |
| Repost | `repost.repostCreated` / `repost.repostDeleted` | `Repost` / `undefined` |
| Notification | `notification.likeNotificationCreated` / `notification.likeNotificationDeleted` | `LikeNotification` / `undefined` |
| TimelineItem | `timelineItem.created` / `timelineItem.deleted` | `TimelineItem` / `undefined` |
| Follow | `follow.followAccepted` / `follow.undoFollowingProcessed` | `Follow` / `undefined` |

## 集約境界の規則

1. **集約間はID参照のみ** — 直接的なオブジェクト参照は禁止
2. **ストアは自身の集約のみ操作** — 他の集約のデータを直接変更しない
3. **カスケード削除はユースケース層で実装** — リゾルバー並列実行 + イベントバッチでN+1回避
4. **削除順序は子→親** — 参照関係の子から親へ向かう順序
5. **削除イベントには既存データが必要** — 存在確認なしの削除イベント生成は禁止

## ストアとリゾルバーのパターン

- **Store**: `store: (...events: readonly T[]) => ResultAsync<void, never>` — rest parameterで複数イベント、1トランザクション
- **Resolver**: `resolve: (condition: TCondition) => ResultAsync<TResolved, never>`

### 命名規則

| パターン | 命名規則 | 例 |
|---------|---------|-----|
| 単一取得 | `{Entity}Resolver` | `PostResolver` |
| 条件取得 | `{Entity}ResolverBy{Condition}` | `PostsResolverByActorId` |
| 作成ストア | `{Event}Store` | `PostCreatedStore` |
| 削除ストア | `{Event}Store` | `PostDeletedStore` |
