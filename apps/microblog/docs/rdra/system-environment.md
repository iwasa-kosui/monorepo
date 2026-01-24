# iori（庵）システム外部環境定義書

**作成日**: 2026-01-24
**バージョン**: 1.0

---

## 1. 利用シーン（シナリオ）

ナレッジワーカーがioriを使用する典型的なシーンを整理します。

### 1.1 シーン一覧

| シーンID | シーン名 | 概要 | 関連BUC |
|---------|---------|------|---------|
| SC-01 | 朝の情報収集 | タイムラインから新しい知識を収集し、気になるものをブックマーク | BUC-02 |
| SC-02 | 思考の記録 | 業務中に思いついたアイデアをノートとして記録 | BUC-03 |
| SC-03 | 知識の深掘り | 過去のノートを振り返り、スレッドで思考を展開 | BUC-03 |
| SC-04 | 知見の公開 | まとまった知識を手記として整理し、Fediverseに公開 | BUC-03, BUC-04 |
| SC-05 | 交流と対話 | リモートユーザーからの反応を受け、対話を通じて知識を深化 | BUC-04 |
| SC-06 | 知識の検索 | 過去に蓄積した知識を検索し、現在の課題解決に活用 | BUC-03 |

---

## 2. ビジネスユースケース詳細

### 2.1 BUC-01: 自分だけの知識基盤を持つ

**目的**: 大規模プラットフォームに依存せず、自分のサーバーで知識を管理し、データのポータビリティを確保する

```mermaid
flowchart TB
    subgraph "利用シーン"
        S1["サーバー構築"]
        S2["初期設定"]
        S3["日常利用"]
        S4["データ管理"]
    end

    subgraph "アクター"
        SA["サーバー管理者"]
        NW["ナレッジワーカー"]
    end

    subgraph "BUC-01: 自分だけの知識基盤を持つ"
        UC1["サーバーをセットアップする"]
        UC2["アカウントを作成する"]
        UC3["プロフィールを設定する"]
        UC4["データをエクスポートする"]
    end

    SA --> UC1
    SA --> S1
    S1 --> S2
    NW --> UC2
    NW --> UC3
    S2 --> S3
    S3 --> S4
    NW --> UC4
```

**シナリオ詳細**:

1. **サーバー構築フェーズ**
   - サーバー管理者がioriをVPSまたは自宅サーバーにデプロイ
   - PostgreSQL、ファイルストレージを設定
   - ドメインとSSL証明書を設定

2. **初期設定フェーズ**
   - ナレッジワーカーがアカウントを作成
   - プロフィール（表示名、アイコン、自己紹介）を設定
   - ActivityPubを通じてFediverseに接続

3. **データ主権の確保**
   - すべてのデータは自分のサーバーに保存
   - 必要に応じてデータをエクスポート可能（将来機能）
   - プラットフォームの都合でデータが消えることがない

---

### 2.2 BUC-02: Fediverseから知識を収集する

**目的**: フォロー・ブックマーク・引用を通じて、他者の知識を自分のナレッジベースに取り込む

```mermaid
flowchart TB
    subgraph "インプット源"
        TL["タイムライン"]
        SEARCH["検索結果"]
        LINK["外部リンク"]
    end

    subgraph "収集アクション"
        FOLLOW["フォローする"]
        BM["ブックマークする"]
        QUOTE["引用する"]
    end

    subgraph "ナレッジベース"
        KB["自分の知識基盤"]
    end

    TL --> FOLLOW
    TL --> BM
    TL --> QUOTE
    SEARCH --> FOLLOW
    SEARCH --> BM
    LINK --> BM

    FOLLOW -->|"継続的に購読"| KB
    BM -->|"保存して後で参照"| KB
    QUOTE -->|"自分の文脈で取り込み"| KB
```

**アクティビティフロー**:

```mermaid
sequenceDiagram
    participant NW as ナレッジワーカー
    participant iori as iori
    participant Fediverse as Fediverse

    Note over NW,Fediverse: 朝の情報収集シーン（SC-01）

    NW->>iori: タイムラインを開く
    iori->>Fediverse: フォロー中のノートを取得
    Fediverse-->>iori: ノート一覧
    iori-->>NW: タイムライン表示

    NW->>iori: 興味のあるユーザーを発見
    NW->>iori: フォローする
    iori->>Fediverse: Followアクティビティ送信
    Fediverse-->>iori: Accept

    NW->>iori: 有用なノートを発見
    NW->>iori: ブックマークする（将来機能）
    iori-->>NW: ブックマーク保存完了

    NW->>iori: ノートに思考を加えて引用（将来機能）
    iori->>Fediverse: 引用ノートを配信
```

**収集の3つの方法**:

| 方法 | 説明 | ユースケース | 実装状況 |
|-----|------|-------------|---------|
| **フォロー** | 興味のあるユーザーを購読し、継続的にノートを受信 | 特定分野の専門家を追う | ✅ 実装済 |
| **ブックマーク** | 有用なノートを保存し、後で参照・整理 | 参考資料として保存 | ❌ 未実装 |
| **引用** | 他者のノートに自分の思考を加えて取り込み | 批評や発展的考察 | ❌ 未実装 |

---

### 2.3 BUC-03: 思考を蓄積・整理・体系化する

**目的**: 収集した知識と自分の思考をノートとして記録し、スレッドで展開、手記としてまとめ、タグで分類、検索でアクセス

```mermaid
flowchart TB
    subgraph "思考のライフサイクル"
        CAPTURE["記録する"]
        EXPAND["展開する"]
        ORGANIZE["整理する"]
        FIND["検索する"]
    end

    subgraph "コンテンツ形式"
        NOTE["ノート（断片的思考）"]
        THREAD["スレッド（思考の連鎖）"]
        SHUKI["手記（まとまった知見）"]
    end

    subgraph "整理機構"
        TAG["タグ"]
        SEARCH_IDX["検索インデックス"]
    end

    CAPTURE --> NOTE
    NOTE --> EXPAND
    EXPAND --> THREAD
    THREAD --> ORGANIZE
    ORGANIZE --> SHUKI

    NOTE --> TAG
    THREAD --> TAG
    SHUKI --> TAG

    TAG --> SEARCH_IDX
    SEARCH_IDX --> FIND
    FIND --> NOTE
    FIND --> THREAD
    FIND --> SHUKI
```

**思考の段階**:

```mermaid
stateDiagram-v2
    [*] --> 断片的思考: アイデアが浮かぶ

    断片的思考 --> ノート: 記録
    ノート --> スレッド: 思考を展開
    スレッド --> 手記: 知見をまとめる
    手記 --> [*]: 完成

    ノート --> ノート: 追記・編集
    スレッド --> スレッド: リプライ追加
    手記 --> 手記: 改訂
```

**各コンテンツ形式の特徴**:

| 形式 | 粒度 | 用途 | 公開設定 | 実装状況 |
|-----|------|------|---------|---------|
| **ノート** | 短文（280文字程度） | 思いつきの記録、メモ | 公開/非公開 | ✅ 公開のみ |
| **スレッド** | ノートの連鎖 | 思考の深掘り、議論の展開 | 公開 | ✅ 実装済 |
| **手記** | 長文 | まとまった知見、解説記事 | 公開/非公開 | ✅ 実装済 |

**思考の記録シーン（SC-02）**:

```mermaid
sequenceDiagram
    participant NW as ナレッジワーカー
    participant iori as iori
    participant Fediverse as Fediverse

    Note over NW: 業務中にアイデアが浮かぶ

    NW->>iori: ノートを作成
    NW->>iori: 内容を入力
    NW->>iori: 投稿

    iori->>iori: タイムラインに追加
    iori->>Fediverse: Createアクティビティ配信

    Note over NW: 後から思考を深掘り

    NW->>iori: 過去のノートを開く
    NW->>iori: リプライを追加（スレッド化）
    iori->>Fediverse: Createアクティビティ配信

    Note over NW: 知見がまとまる

    NW->>iori: 手記を作成
    NW->>iori: スレッドの内容を整理して記述
    NW->>iori: 公開
    iori->>Fediverse: Createアクティビティ配信
```

---

### 2.4 BUC-04: 知識を発信・共有する

**目的**: Fediverseに接続して発信、他のユーザーと交流、フィードバックを受けて思考を深化

```mermaid
flowchart TB
    subgraph "発信コンテンツ"
        NOTE["ノート"]
        SHUKI["手記"]
    end

    subgraph "発信先"
        FOLLOWERS["フォロワー"]
        PUBLIC["パブリック"]
    end

    subgraph "反応"
        LIKE["いいね"]
        REPOST["リポスト"]
        REPLY["リプライ"]
        EMOJI["絵文字リアクション"]
    end

    subgraph "フィードバックループ"
        NOTIFY["通知"]
        DIALOG["対話"]
        INSIGHT["新たな知見"]
    end

    NOTE --> FOLLOWERS
    NOTE --> PUBLIC
    SHUKI --> FOLLOWERS
    SHUKI --> PUBLIC

    FOLLOWERS --> LIKE
    FOLLOWERS --> REPOST
    FOLLOWERS --> REPLY
    FOLLOWERS --> EMOJI
    PUBLIC --> LIKE
    PUBLIC --> REPOST
    PUBLIC --> REPLY

    LIKE --> NOTIFY
    REPOST --> NOTIFY
    REPLY --> NOTIFY
    EMOJI --> NOTIFY

    NOTIFY --> DIALOG
    DIALOG --> INSIGHT
    INSIGHT --> NOTE
```

**発信と交流のフロー**:

```mermaid
sequenceDiagram
    participant NW as ナレッジワーカー
    participant iori as iori
    participant Fediverse as Fediverse
    participant RU as リモートユーザー

    Note over NW,RU: 知見の公開シーン（SC-04）

    NW->>iori: 手記を公開
    iori->>Fediverse: Createアクティビティ配信
    Fediverse->>RU: 配信

    RU->>Fediverse: いいね
    Fediverse->>iori: Likeアクティビティ受信
    iori->>NW: 通知

    RU->>Fediverse: リプライ
    Fediverse->>iori: Createアクティビティ受信
    iori->>NW: 通知

    Note over NW,RU: 交流と対話シーン（SC-05）

    NW->>iori: リプライに返信
    iori->>Fediverse: Createアクティビティ配信
    Fediverse->>RU: 配信

    Note over NW: 対話から新たな知見を得る
    NW->>iori: 新しいノートを作成
```

**反応の種類と意味**:

| 反応 | 送信側の意図 | 受信側の活用 | 実装状況 |
|-----|------------|------------|---------|
| **いいね** | 共感・賛同 | モチベーション | ✅ 実装済 |
| **リポスト** | 拡散・共有 | リーチ拡大 | ✅ 実装済 |
| **リプライ** | 議論・質問 | 対話・深化 | ✅ 実装済 |
| **絵文字リアクション** | 感情表現 | ニュアンス理解 | ✅ 実装済 |

---

## 3. ビジネスユースケース間の関係

```mermaid
flowchart LR
    subgraph "知識の流れ"
        BUC02["BUC-02<br/>Fediverseから<br/>知識を収集"]
        BUC03["BUC-03<br/>思考を蓄積<br/>整理・体系化"]
        BUC04["BUC-04<br/>知識を発信<br/>共有"]
    end

    subgraph "基盤"
        BUC01["BUC-01<br/>自分だけの<br/>知識基盤"]
    end

    BUC01 --> BUC02
    BUC01 --> BUC03
    BUC01 --> BUC04

    BUC02 -->|"収集した知識"| BUC03
    BUC03 -->|"整理された知見"| BUC04
    BUC04 -->|"フィードバック"| BUC02
```

**知識のサイクル**:

1. **収集** (BUC-02): Fediverseから他者の知識を取り込む
2. **蓄積・整理** (BUC-03): 自分の思考と融合させ、体系化する
3. **発信** (BUC-04): まとまった知見を公開し、フィードバックを得る
4. **再収集**: フィードバックから新たな知識を得て、サイクルが回る

この循環が「**集合知に接続されたセカンドブレイン**」としてのioriの価値を生み出します。

---

## 4. アクター×ビジネスユースケース マトリクス

| アクター | BUC-01<br/>知識基盤 | BUC-02<br/>収集 | BUC-03<br/>蓄積・整理 | BUC-04<br/>発信 |
|---------|:---:|:---:|:---:|:---:|
| **ナレッジワーカー** | ○ | ◎ | ◎ | ◎ |
| **リモートユーザー** | - | - | - | ○ |
| **閲覧者** | - | - | - | △ |
| **サーバー管理者** | ◎ | - | - | - |

凡例: ◎ 主たる利用者 / ○ 利用する / △ 限定的に利用 / - 利用しない

---

## 5. 未実装機能の整理

BUCの達成に必要だが未実装の機能を整理します。

### 5.1 BUC-02（知識収集）の未実装機能

| 機能 | 必要性 | 優先度 |
|-----|-------|-------|
| ブックマーク | 他者のノートを保存し、後で参照できる | **高** |
| 引用ノート | 他者のノートに文脈を加えて取り込める | **高** |
| ブックマーク一覧 | 保存したノートを一覧・検索できる | 中 |

### 5.2 BUC-03（蓄積・整理）の未実装機能

| 機能 | 必要性 | 優先度 |
|-----|-------|-------|
| 全文検索 | 蓄積した知識を検索できる | **高** |
| タグ付け | ノート・手記をタグで分類できる | **高** |
| タグ検索 | タグで絞り込み検索できる | 中 |
| 非公開ノート | 自分だけが見られるノートを作成 | 中 |
| 双方向リンク | ノート間を相互にリンクできる | 低 |

### 5.3 BUC-04（発信）は概ね実装済み

通知、いいね、リポスト、リプライ、絵文字リアクションはすべて実装済みです。

---

## 改訂履歴

| 日付 | バージョン | 変更内容 |
|-----|----------|---------|
| 2026-01-24 | 1.0 | 初版作成 |
