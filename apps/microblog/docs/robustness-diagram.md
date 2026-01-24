# iori（庵）ロバストネス図

**作成日**: 2026-01-24
**バージョン**: 1.0

---

## 1. 概要

本ドキュメントでは、iori（庵）システムの主要ユースケースをロバストネス図で表現します。
ロバストネス図は、バウンダリ（UI）、コントローラ（処理）、エンティティ（データ）の3つの要素でシステムの振る舞いを可視化します。

### 1.1 凡例

| 要素 | 記号 | 説明 |
|-----|------|------|
| アクター | 👤 | システムの利用者 |
| バウンダリ | 🖥️/👆 | 画面・UI要素 |
| コントローラ | 🔄 | 処理・ロジック |
| エンティティ | 💾 | データ・集約 |

---

## 2. 認証系

### 2.1 サインアップ・サインイン

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph signUpView["🖥️ サインアップ画面"]
            signUpForm["👆 サインアップフォーム"]
            signUpForm:::boundary
        end

        subgraph signInView["🖥️ サインイン画面"]
            signInForm["👆 サインインフォーム"]
            signInForm:::boundary
        end

        subgraph homeView["🖥️ ホーム画面"]
            homeScreen["🖥️ タイムライン"]
            homeScreen:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        signUpCtrl["🔄 ユーザー登録する"]
        signUpCtrl:::control
        signInCtrl["🔄 認証する"]
        signInCtrl:::control
        createActorCtrl["🔄 アクター作成する"]
        createActorCtrl:::control
        createSessionCtrl["🔄 セッション作成する"]
        createSessionCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        user[("💾 User")]
        user:::entity
        actor[("💾 LocalActor")]
        actor:::entity
        session[("💾 Session")]
        session:::entity
        key[("💾 Key")]
        key:::entity
    end

    actorUser --> signUpForm
    actorUser --> signInForm
    signUpForm --> signUpCtrl
    signUpCtrl --> user
    signUpCtrl --> createActorCtrl
    createActorCtrl --> actor
    createActorCtrl --> key
    signInForm --> signInCtrl
    signInCtrl --> user
    signInCtrl --> createSessionCtrl
    createSessionCtrl --> session
    createSessionCtrl --> homeScreen
    actorUser -.- homeScreen
```

---

## 3. コンテンツ系

### 3.1 ノート作成

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]
    actorFediverse["🌐 Fediverse"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph homeView["🖥️ ホーム画面"]
            postForm["👆 投稿フォーム"]
            postForm:::boundary
            imageUpload["👆 画像アップロード"]
            imageUpload:::boundary
        end

        subgraph timelineView["🖥️ タイムライン"]
            newPost["🖥️ 新規投稿表示"]
            newPost:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        createPostCtrl["🔄 ノート作成する"]
        createPostCtrl:::control
        uploadImageCtrl["🔄 画像保存する"]
        uploadImageCtrl:::control
        fetchOgpCtrl["🔄 OGP取得する"]
        fetchOgpCtrl:::control
        addTimelineCtrl["🔄 TL追加する"]
        addTimelineCtrl:::control
        deliverCtrl["🔄 Fediverse配信する"]
        deliverCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        post[("💾 Post")]
        post:::entity
        image[("💾 Image")]
        image:::entity
        linkPreview[("💾 LinkPreview")]
        linkPreview:::entity
        timelineItem[("💾 TimelineItem")]
        timelineItem:::entity
    end

    actorUser --> postForm
    actorUser --> imageUpload
    postForm --> createPostCtrl
    imageUpload --> uploadImageCtrl
    uploadImageCtrl --> image
    createPostCtrl --> post
    createPostCtrl --> fetchOgpCtrl
    fetchOgpCtrl --> linkPreview
    createPostCtrl --> addTimelineCtrl
    addTimelineCtrl --> timelineItem
    createPostCtrl --> deliverCtrl
    deliverCtrl --> actorFediverse
    newPost -.- addTimelineCtrl
    actorUser -.- newPost
```

### 3.2 リプライ（スレッド展開）

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]
    actorFediverse["🌐 Fediverse"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph postDetailView["🖥️ 投稿詳細画面"]
            originalPost["🖥️ 元投稿表示"]
            originalPost:::boundary
            replyForm["👆 リプライフォーム"]
            replyForm:::boundary
            threadView["🖥️ スレッド表示"]
            threadView:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        getPostCtrl["🔄 投稿取得する"]
        getPostCtrl:::control
        getThreadCtrl["🔄 スレッド取得する"]
        getThreadCtrl:::control
        sendReplyCtrl["🔄 リプライ送信する"]
        sendReplyCtrl:::control
        notifyCtrl["🔄 通知作成する"]
        notifyCtrl:::control
        deliverCtrl["🔄 Fediverse配信する"]
        deliverCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        post[("💾 Post")]
        post:::entity
        replyPost[("💾 Post<br/>リプライ")]
        replyPost:::entity
        notification[("💾 ReplyNotification")]
        notification:::entity
    end

    actorUser --> originalPost
    originalPost --> getPostCtrl
    getPostCtrl --> post
    getPostCtrl --> getThreadCtrl
    getThreadCtrl --> post
    threadView -.- getThreadCtrl
    actorUser --> replyForm
    replyForm --> sendReplyCtrl
    sendReplyCtrl --> replyPost
    sendReplyCtrl --> notifyCtrl
    notifyCtrl --> notification
    sendReplyCtrl --> deliverCtrl
    deliverCtrl --> actorFediverse
```

### 3.3 手記作成・公開

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]
    actorFediverse["🌐 Fediverse"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph threadView["🖥️ スレッド画面"]
            threadPosts["🖥️ スレッド投稿一覧"]
            threadPosts:::boundary
            createArticleBtn["👆 手記作成ボタン"]
            createArticleBtn:::boundary
        end

        subgraph articleEditView["🖥️ 手記編集画面"]
            titleInput["👆 タイトル入力"]
            titleInput:::boundary
            publishBtn["👆 公開ボタン"]
            publishBtn:::boundary
        end

        subgraph articleView["🖥️ 手記表示画面"]
            articleContent["🖥️ 手記コンテンツ"]
            articleContent:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        createArticleCtrl["🔄 手記作成する"]
        createArticleCtrl:::control
        publishArticleCtrl["🔄 手記公開する"]
        publishArticleCtrl:::control
        deliverCtrl["🔄 Fediverse配信する"]
        deliverCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        post[("💾 Post<br/>rootPost")]
        post:::entity
        article[("💾 Article")]
        article:::entity
    end

    actorUser --> threadPosts
    actorUser --> createArticleBtn
    createArticleBtn --> createArticleCtrl
    createArticleCtrl --> post
    createArticleCtrl --> article
    actorUser --> titleInput
    actorUser --> publishBtn
    publishBtn --> publishArticleCtrl
    publishArticleCtrl --> article
    publishArticleCtrl --> deliverCtrl
    deliverCtrl --> actorFediverse
    articleContent -.- publishArticleCtrl
    actorUser -.- articleContent
```

---

## 4. タイムライン系

### 4.1 ホームタイムライン表示

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph homeView["🖥️ ホーム画面"]
            timeline["🖥️ タイムライン"]
            timeline:::boundary
            loadMoreBtn["👆 さらに読み込む"]
            loadMoreBtn:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        getFollowingCtrl["🔄 フォロー中取得する"]
        getFollowingCtrl:::control
        getMutedCtrl["🔄 ミュート取得する"]
        getMutedCtrl:::control
        getTimelineCtrl["🔄 TLアイテム取得する"]
        getTimelineCtrl:::control
        enrichPostCtrl["🔄 投稿情報付与する"]
        enrichPostCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        follow[("💾 Follow")]
        follow:::entity
        mute[("💾 Mute")]
        mute:::entity
        timelineItem[("💾 TimelineItem")]
        timelineItem:::entity
        post[("💾 Post")]
        post:::entity
        actor[("💾 Actor")]
        actor:::entity
        like[("💾 Like")]
        like:::entity
        repost[("💾 Repost")]
        repost:::entity
    end

    actorUser --> timeline
    actorUser --> loadMoreBtn
    timeline --> getFollowingCtrl
    getFollowingCtrl --> follow
    getFollowingCtrl --> getMutedCtrl
    getMutedCtrl --> mute
    getMutedCtrl --> getTimelineCtrl
    getTimelineCtrl --> timelineItem
    getTimelineCtrl --> enrichPostCtrl
    enrichPostCtrl --> post
    enrichPostCtrl --> actor
    enrichPostCtrl --> like
    enrichPostCtrl --> repost
    loadMoreBtn --> getTimelineCtrl
```

### 4.2 ユーザー投稿一覧表示

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph userView["🖥️ ユーザー画面"]
            profile["🖥️ プロフィール"]
            profile:::boundary
            postList["🖥️ 投稿一覧"]
            postList:::boundary
            articleList["🖥️ 手記一覧"]
            articleList:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        getActorCtrl["🔄 アクター取得する"]
        getActorCtrl:::control
        getPostsCtrl["🔄 投稿一覧取得する"]
        getPostsCtrl:::control
        getArticlesCtrl["🔄 手記一覧取得する"]
        getArticlesCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        actor[("💾 Actor")]
        actor:::entity
        post[("💾 Post")]
        post:::entity
        article[("💾 Article")]
        article:::entity
    end

    actorUser --> profile
    actorUser --> postList
    actorUser --> articleList
    profile --> getActorCtrl
    getActorCtrl --> actor
    postList --> getPostsCtrl
    getPostsCtrl --> post
    articleList --> getArticlesCtrl
    getArticlesCtrl --> article
```

---

## 5. ソーシャル系

### 5.1 フォロー

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]
    actorFediverse["🌐 Fediverse"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph userView["🖥️ ユーザー画面"]
            followBtn["👆 フォローボタン"]
            followBtn:::boundary
            unfollowBtn["👆 フォロー解除ボタン"]
            unfollowBtn:::boundary
            followerCount["🖥️ フォロワー数"]
            followerCount:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        sendFollowCtrl["🔄 フォロー送信する"]
        sendFollowCtrl:::control
        acceptFollowCtrl["🔄 フォロー承認する"]
        acceptFollowCtrl:::control
        unfollowCtrl["🔄 フォロー解除する"]
        unfollowCtrl:::control
        notifyCtrl["🔄 通知作成する"]
        notifyCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        follow[("💾 Follow")]
        follow:::entity
        notification[("💾 FollowNotification")]
        notification:::entity
        actor[("💾 Actor")]
        actor:::entity
    end

    actorUser --> followBtn
    followBtn --> sendFollowCtrl
    sendFollowCtrl --> actorFediverse
    actorFediverse --> acceptFollowCtrl
    acceptFollowCtrl --> follow
    acceptFollowCtrl --> notifyCtrl
    notifyCtrl --> notification
    actorUser --> unfollowBtn
    unfollowBtn --> unfollowCtrl
    unfollowCtrl --> follow
    unfollowCtrl --> actorFediverse
    followerCount -.- follow
```

### 5.2 いいね

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]
    actorFediverse["🌐 Fediverse"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph postView["🖥️ 投稿表示"]
            likeBtn["👆 いいねボタン"]
            likeBtn:::boundary
            likeCount["🖥️ いいね数"]
            likeCount:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        sendLikeCtrl["🔄 いいね送信する"]
        sendLikeCtrl:::control
        undoLikeCtrl["🔄 いいね取消する"]
        undoLikeCtrl:::control
        notifyCtrl["🔄 通知作成する"]
        notifyCtrl:::control
        deliverCtrl["🔄 Fediverse配信する"]
        deliverCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        like[("💾 Like")]
        like:::entity
        notification[("💾 LikeNotification")]
        notification:::entity
        post[("💾 Post")]
        post:::entity
    end

    actorUser --> likeBtn
    likeBtn --> sendLikeCtrl
    sendLikeCtrl --> like
    sendLikeCtrl --> notifyCtrl
    notifyCtrl --> notification
    sendLikeCtrl --> deliverCtrl
    deliverCtrl --> actorFediverse
    likeBtn --> undoLikeCtrl
    undoLikeCtrl --> like
    undoLikeCtrl --> notification
    undoLikeCtrl --> deliverCtrl
    likeCount -.- like
```

### 5.3 リポスト

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]
    actorFediverse["🌐 Fediverse"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph postView["🖥️ 投稿表示"]
            repostBtn["👆 リポストボタン"]
            repostBtn:::boundary
            repostCount["🖥️ リポスト数"]
            repostCount:::boundary
        end

        subgraph timelineView["🖥️ タイムライン"]
            repostItem["🖥️ リポスト表示"]
            repostItem:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        sendRepostCtrl["🔄 リポスト作成する"]
        sendRepostCtrl:::control
        undoRepostCtrl["🔄 リポスト取消する"]
        undoRepostCtrl:::control
        addTimelineCtrl["🔄 TL追加する"]
        addTimelineCtrl:::control
        deliverCtrl["🔄 Fediverse配信する"]
        deliverCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        repost[("💾 Repost")]
        repost:::entity
        timelineItem[("💾 TimelineItem")]
        timelineItem:::entity
        post[("💾 Post")]
        post:::entity
    end

    actorUser --> repostBtn
    repostBtn --> sendRepostCtrl
    sendRepostCtrl --> repost
    sendRepostCtrl --> addTimelineCtrl
    addTimelineCtrl --> timelineItem
    sendRepostCtrl --> deliverCtrl
    deliverCtrl --> actorFediverse
    repostBtn --> undoRepostCtrl
    undoRepostCtrl --> repost
    undoRepostCtrl --> timelineItem
    undoRepostCtrl --> deliverCtrl
    repostCount -.- repost
    repostItem -.- timelineItem
```

### 5.4 絵文字リアクション

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]
    actorFediverse["🌐 Fediverse"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph postView["🖥️ 投稿表示"]
            reactBtn["👆 リアクションボタン"]
            reactBtn:::boundary
            emojiPicker["👆 絵文字ピッカー"]
            emojiPicker:::boundary
            reactionsDisplay["🖥️ リアクション表示"]
            reactionsDisplay:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        sendReactCtrl["🔄 リアクション送信する"]
        sendReactCtrl:::control
        undoReactCtrl["🔄 リアクション取消する"]
        undoReactCtrl:::control
        notifyCtrl["🔄 通知作成する"]
        notifyCtrl:::control
        deliverCtrl["🔄 Fediverse配信する"]
        deliverCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        emojiReact[("💾 EmojiReact")]
        emojiReact:::entity
        notification[("💾 EmojiReactNotification")]
        notification:::entity
        post[("💾 Post")]
        post:::entity
    end

    actorUser --> reactBtn
    reactBtn --> emojiPicker
    emojiPicker --> sendReactCtrl
    sendReactCtrl --> emojiReact
    sendReactCtrl --> notifyCtrl
    notifyCtrl --> notification
    sendReactCtrl --> deliverCtrl
    deliverCtrl --> actorFediverse
    reactBtn --> undoReactCtrl
    undoReactCtrl --> emojiReact
    undoReactCtrl --> notification
    undoReactCtrl --> deliverCtrl
    reactionsDisplay -.- emojiReact
```

---

## 6. 通知系

### 6.1 通知一覧表示・既読化

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph navView["🖥️ ナビゲーション"]
            notifBadge["🖥️ 通知バッジ"]
            notifBadge:::boundary
            notifBtn["👆 通知ボタン"]
            notifBtn:::boundary
        end

        subgraph notifView["🖥️ 通知画面"]
            notifList["🖥️ 通知一覧"]
            notifList:::boundary
            markReadBtn["👆 既読にする"]
            markReadBtn:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        getUnreadCountCtrl["🔄 未読数取得する"]
        getUnreadCountCtrl:::control
        getNotificationsCtrl["🔄 通知一覧取得する"]
        getNotificationsCtrl:::control
        markAsReadCtrl["🔄 既読にする"]
        markAsReadCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        notification[("💾 Notification")]
        notification:::entity
        actor[("💾 Actor")]
        actor:::entity
        post[("💾 Post")]
        post:::entity
    end

    actorUser -.- notifBadge
    notifBadge --> getUnreadCountCtrl
    getUnreadCountCtrl --> notification
    actorUser --> notifBtn
    notifBtn --> getNotificationsCtrl
    getNotificationsCtrl --> notification
    getNotificationsCtrl --> actor
    getNotificationsCtrl --> post
    notifList -.- getNotificationsCtrl
    actorUser --> markReadBtn
    markReadBtn --> markAsReadCtrl
    markAsReadCtrl --> notification
```

---

## 7. Fediverse受信系

### 7.1 リモート投稿受信

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorFediverse["🌐 Fediverse"]
    actorUser["👤 ナレッジワーカー"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph inboxView["🖥️ ActivityPub Inbox"]
            inbox["📥 Inbox エンドポイント"]
            inbox:::boundary
        end

        subgraph timelineView["🖥️ タイムライン"]
            newRemotePost["🖥️ リモート投稿表示"]
            newRemotePost:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        verifySignatureCtrl["🔄 署名検証する"]
        verifySignatureCtrl:::control
        processCreateCtrl["🔄 Create処理する"]
        processCreateCtrl:::control
        resolveActorCtrl["🔄 アクター解決する"]
        resolveActorCtrl:::control
        addRemotePostCtrl["🔄 リモート投稿追加する"]
        addRemotePostCtrl:::control
        addTimelineCtrl["🔄 TL追加する"]
        addTimelineCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        key[("💾 Key")]
        key:::entity
        remoteActor[("💾 RemoteActor")]
        remoteActor:::entity
        remotePost[("💾 RemotePost")]
        remotePost:::entity
        timelineItem[("💾 TimelineItem")]
        timelineItem:::entity
    end

    actorFediverse --> inbox
    inbox --> verifySignatureCtrl
    verifySignatureCtrl --> key
    verifySignatureCtrl --> processCreateCtrl
    processCreateCtrl --> resolveActorCtrl
    resolveActorCtrl --> remoteActor
    processCreateCtrl --> addRemotePostCtrl
    addRemotePostCtrl --> remotePost
    addRemotePostCtrl --> addTimelineCtrl
    addTimelineCtrl --> timelineItem
    newRemotePost -.- timelineItem
    actorUser -.- newRemotePost
```

### 7.2 リモートいいね受信

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorFediverse["🌐 Fediverse"]
    actorUser["👤 ナレッジワーカー"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph inboxView["🖥️ ActivityPub Inbox"]
            inbox["📥 Inbox エンドポイント"]
            inbox:::boundary
        end

        subgraph notifView["🖥️ 通知"]
            newNotif["🖥️ いいね通知"]
            newNotif:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        processLikeCtrl["🔄 Like処理する"]
        processLikeCtrl:::control
        resolveActorCtrl["🔄 アクター解決する"]
        resolveActorCtrl:::control
        addLikeCtrl["🔄 いいね追加する"]
        addLikeCtrl:::control
        notifyCtrl["🔄 通知作成する"]
        notifyCtrl:::control
        pushNotifyCtrl["🔄 Push通知送信する"]
        pushNotifyCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        remoteActor[("💾 RemoteActor")]
        remoteActor:::entity
        like[("💾 Like")]
        like:::entity
        notification[("💾 LikeNotification")]
        notification:::entity
        pushSubscription[("💾 PushSubscription")]
        pushSubscription:::entity
    end

    actorFediverse --> inbox
    inbox --> processLikeCtrl
    processLikeCtrl --> resolveActorCtrl
    resolveActorCtrl --> remoteActor
    processLikeCtrl --> addLikeCtrl
    addLikeCtrl --> like
    addLikeCtrl --> notifyCtrl
    notifyCtrl --> notification
    notifyCtrl --> pushNotifyCtrl
    pushNotifyCtrl --> pushSubscription
    newNotif -.- notification
    actorUser -.- newNotif
```

---

## 8. 削除系

### 8.1 投稿削除（カスケード）

```mermaid
---
config:
  theme: redux
---
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actorUser["👤 ナレッジワーカー"]
    actorFediverse["🌐 Fediverse"]

    subgraph boundarySg["バウンダリ"]
        direction TB

        subgraph postView["🖥️ 投稿表示"]
            deleteBtn["👆 削除ボタン"]
            deleteBtn:::boundary
            confirmDialog["👆 確認ダイアログ"]
            confirmDialog:::boundary
        end
    end

    subgraph controlSg["コントローラ"]
        direction TB
        deletePostCtrl["🔄 投稿削除する"]
        deletePostCtrl:::control
        deleteTimelineCtrl["🔄 TL削除する"]
        deleteTimelineCtrl:::control
        deleteLikesCtrl["🔄 いいね削除する"]
        deleteLikesCtrl:::control
        deleteRepostsCtrl["🔄 リポスト削除する"]
        deleteRepostsCtrl:::control
        deleteNotifCtrl["🔄 通知削除する"]
        deleteNotifCtrl:::control
        deliverDeleteCtrl["🔄 削除配信する"]
        deliverDeleteCtrl:::control
    end

    subgraph entitySg["エンティティ"]
        direction TB
        post[("💾 Post")]
        post:::entity
        timelineItem[("💾 TimelineItem")]
        timelineItem:::entity
        like[("💾 Like")]
        like:::entity
        repost[("💾 Repost")]
        repost:::entity
        notification[("💾 Notification")]
        notification:::entity
    end

    actorUser --> deleteBtn
    deleteBtn --> confirmDialog
    confirmDialog --> deletePostCtrl
    deletePostCtrl --> deleteTimelineCtrl
    deleteTimelineCtrl --> timelineItem
    deletePostCtrl --> deleteLikesCtrl
    deleteLikesCtrl --> like
    deletePostCtrl --> deleteRepostsCtrl
    deleteRepostsCtrl --> repost
    deletePostCtrl --> deleteNotifCtrl
    deleteNotifCtrl --> notification
    deletePostCtrl --> post
    deletePostCtrl --> deliverDeleteCtrl
    deliverDeleteCtrl --> actorFediverse
```

---

## 9. ユースケース×コントローラ対応表

| ユースケース | コントローラ | エンティティ |
|------------|------------|------------|
| サインアップ | ユーザー登録、アクター作成 | User, LocalActor, Key |
| サインイン | 認証、セッション作成 | User, Session |
| ノート作成 | ノート作成、画像保存、OGP取得、TL追加、配信 | Post, Image, LinkPreview, TimelineItem |
| リプライ | リプライ送信、通知作成、配信 | Post, ReplyNotification |
| 手記作成 | 手記作成、手記公開、配信 | Post, Article |
| TL表示 | フォロー取得、ミュート取得、TLアイテム取得、情報付与 | Follow, Mute, TimelineItem, Post, Actor |
| フォロー | フォロー送信、フォロー承認、通知作成 | Follow, FollowNotification |
| いいね | いいね送信、通知作成、配信 | Like, LikeNotification |
| リポスト | リポスト作成、TL追加、配信 | Repost, TimelineItem |
| 絵文字リアクション | リアクション送信、通知作成、配信 | EmojiReact, EmojiReactNotification |
| 通知表示 | 未読数取得、通知一覧取得、既読化 | Notification, Actor, Post |
| リモート投稿受信 | 署名検証、Create処理、アクター解決、TL追加 | Key, RemoteActor, RemotePost, TimelineItem |
| 投稿削除 | 投稿削除、TL削除、いいね削除、リポスト削除、通知削除、配信 | Post, TimelineItem, Like, Repost, Notification |

---

## 改訂履歴

| 日付 | バージョン | 変更内容 |
|-----|----------|---------|
| 2026-01-24 | 1.0 | 初版作成 |
