---
type: rdra-context
id: "BIZ-006"
name: "event-streaming"
display_name: "イベント配信"

# システム価値レイヤー
value:
  goals: ["GOAL-003", "GOAL-004"]
  requirements:
    - id: "REQ-028"
      description: "すべてのドメインイベントを永続的に記録し、監査証跡として利用できる"
      traces_to: ["GOAL-003"]
    - id: "REQ-029"
      description: "プロダクト提供者がイベントストリームをポーリングしてドメインイベントを取得できる（カーソルベースの差分取得）"
      traces_to: ["GOAL-004"]
    - id: "REQ-030"
      description: "イベントコンシューマごとにフィルタ条件を設定できる（イベント種別・コンテキスト・組織）"
      traces_to: ["GOAL-004"]
    - id: "REQ-031"
      description: "データの一括取得APIを提供できる（初期同期・リカバリ用）"
      traces_to: ["GOAL-004"]
    - id: "REQ-032"
      description: "監査ログを検索・参照できる（基盤提供者は全組織、組織管理者は自組織、OU管理者は担当OU関連）"
      traces_to: ["GOAL-003"]

# 外部環境レイヤー
environment:
  business_usecases:
    - id: "BUC-025"
      name: "イベントコンシューマを管理する"
      actors: ["ACTOR-005", "ACTOR-006"]
      description: "イベントストリームの消費者を登録・設定変更・削除する。コンシューマごとにフィルタ条件を設定可能"
      traces_to: ["REQ-029", "REQ-030"]
    - id: "BUC-026"
      name: "イベントを取得する"
      actors: ["ACTOR-005"]
      description: "イベントストリームをカーソルベースでポーリングし、差分のドメインイベントを取得する"
      traces_to: ["REQ-029"]
    - id: "BUC-027"
      name: "データを一括取得する"
      actors: ["ACTOR-005"]
      description: "組織・OU・グループ・ユーザー・ロール割当の現在の状態を一括取得する（初期同期・リカバリ用）"
      traces_to: ["REQ-031"]
    - id: "BUC-028"
      name: "監査ログを参照する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006"]
      description: "ドメインイベントの監査ログを検索・参照する。アクターの権限に応じて参照範囲が制限される"
      traces_to: ["REQ-028", "REQ-032"]

# システム境界レイヤー
boundary:
  usecases:
    - id: "UC-045"
      name: "イベントコンシューマを登録する"
      actors: ["ACTOR-005", "ACTOR-006"]
      screens: ["SCR-010"]
      events: ["EVT-033"]
      traces_to: ["BUC-025"]
      description: "コンシューマ名・フィルタ条件（イベント種別・コンテキスト・組織）を受け取り、コンシューマを登録する。APIクレデンシャルを発行する"
    - id: "UC-046"
      name: "イベントコンシューマのフィルタを変更する"
      actors: ["ACTOR-005", "ACTOR-006"]
      screens: ["SCR-010"]
      events: ["EVT-034"]
      traces_to: ["BUC-025"]
      description: "コンシューマのフィルタ条件（イベント種別・コンテキスト・組織）を変更する"
    - id: "UC-047"
      name: "イベントコンシューマを削除する"
      actors: ["ACTOR-005", "ACTOR-006"]
      screens: ["SCR-010"]
      events: ["EVT-035"]
      traces_to: ["BUC-025"]
      description: "コンシューマを削除する。カーソル位置も破棄される"
    - id: "UC-048"
      name: "イベントコンシューマ一覧を取得する"
      actors: ["ACTOR-005", "ACTOR-006"]
      screens: ["SCR-010"]
      events: []
      traces_to: ["BUC-025"]
      description: "登録済みのコンシューマ一覧（名前・フィルタ・カーソル位置・最終取得日時）を取得する"
    - id: "UC-049"
      name: "イベントストリームをポーリングする"
      actors: ["ACTOR-005"]
      screens: []
      events: []
      traces_to: ["BUC-026"]
      description: "カーソル位置を指定してイベントストリームをポーリングし、差分イベントを取得する。取得後にカーソル位置が進む。フィルタ条件に合致するイベントのみ返却"
    - id: "UC-050"
      name: "データを一括取得する"
      actors: ["ACTOR-005"]
      screens: []
      events: []
      traces_to: ["BUC-027"]
      description: "組織・OU・グループ・ユーザー・ロール割当の現在の状態をエンティティ種別ごとに一括取得する。ページネーション付き"
    - id: "UC-051"
      name: "監査ログを検索する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006"]
      screens: ["SCR-011"]
      events: []
      traces_to: ["BUC-028"]
      description: "期間・イベント種別・コンテキスト・組織・ユーザーで監査ログを検索する。基盤提供者は全組織、組織管理者は自組織、OU管理者は担当OU関連に限定"
  screens:
    - id: "SCR-010"
      name: "イベントコンシューマ管理画面"
      description: "基盤提供者向け管理画面。コンシューマの登録・フィルタ設定・削除・カーソル位置確認を提供"
      information: ["INFO-006"]
    - id: "SCR-011"
      name: "監査ログ画面"
      description: "基盤提供者・組織管理者・OU管理者向け画面。ドメインイベントの検索・詳細表示。アクターの権限に応じて参照範囲を制限"
      information: ["INFO-001", "INFO-002", "INFO-003", "INFO-004", "INFO-005"]
  events:
    - id: "EVT-033"
      name: "コンシューマ登録イベント"
      trigger: "UC-045 コンシューマ登録完了時"
      description: "イベントコンシューマが登録されたことを表すドメインイベント"
    - id: "EVT-034"
      name: "コンシューマフィルタ変更イベント"
      trigger: "UC-046 フィルタ変更完了時"
      description: "イベントコンシューマのフィルタ条件が変更されたことを表すドメインイベント"
    - id: "EVT-035"
      name: "コンシューマ削除イベント"
      trigger: "UC-047 コンシューマ削除完了時"
      description: "イベントコンシューマが削除されたことを表すドメインイベント"

# システムレイヤー
system:
  information: ["INFO-006"]
  states: []
  conditions:
    - id: "COND-023"
      name: "イベントIDによる冪等性"
      description: "各ドメインイベントは一意のeventIdを持ち、コンシューマ側で冪等な処理を可能にする"
      traces_to: ["UC-049"]
    - id: "COND-024"
      name: "集約ID単位の順序保証"
      description: "同一集約IDに対するイベントは発生順に取得されることを保証する。異なる集約間の順序は保証しない"
      traces_to: ["UC-049"]
    - id: "COND-025"
      name: "イベント保持期間"
      description: "イベントの保持期間は基盤提供者が設定する。保持期間を過ぎたイベントはストリームから取得不可となるが、監査ログとしては保持される"
      traces_to: ["UC-049", "UC-051"]
    - id: "COND-026"
      name: "監査ログ参照範囲の制限"
      description: "監査ログの参照範囲はアクターの権限に応じて制限される。基盤提供者は全組織、組織管理者は自組織、OU管理者は担当OU関連のイベントのみ"
      traces_to: ["UC-051"]
    - id: "COND-027"
      name: "コンシューマ名の一意性"
      description: "コンシューマ名は基盤全体で一意でなければならない"
      traces_to: ["UC-045"]
  variations: []
---

# BIZ-006: イベント配信

## ビジネスコンテキスト図

```mermaid
graph LR
    product["ACTOR-005: プロダクト提供者\n（複数）"]
    platform["ACTOR-006: 基盤提供者"]
    orgAdmin["ACTOR-002: 組織管理者"]
    ouAdmin["ACTOR-003: 組織単位管理者"]

    subgraph ctx["BIZ-006: イベント配信"]
        buc25["BUC-025: イベント\nコンシューマを管理する"]
        buc26["BUC-026: イベントを\n取得する"]
        buc27["BUC-027: データを\n一括取得する"]
        buc28["BUC-028: 監査ログを\n参照する"]
    end

    product --> buc25
    product --> buc26
    product --> buc27
    platform --> buc25
    platform --> buc28
    orgAdmin --> buc28
    ouAdmin --> buc28
```

## 業務フロー

### BUC-025: イベントコンシューマを管理する

```mermaid
sequenceDiagram
    actor P as プロダクト提供者<br/>/ 基盤提供者
    participant S as akashic-ts

    Note over P,S: === コンシューマ登録 ===
    P->>S: コンシューマ登録要求<br/>（コンシューマ名・フィルタ条件）
    activate S
    S->>S: コンシューマ名の一意性を検証
    alt コンシューマ名が重複
        S-->>P: エラー（名前重複）
    else 正常
        S->>S: コンシューマを登録
        S->>S: APIクレデンシャルを発行
        S->>S: カーソル位置を最新に初期化
        S-->>P: 登録完了（クレデンシャル・コンシューマID）
    end
    deactivate S

    Note over P,S: === フィルタ変更 ===
    P->>S: フィルタ変更要求<br/>（コンシューマID・新フィルタ条件）
    activate S
    S->>S: フィルタ条件を更新
    S-->>P: 変更完了
    deactivate S

    Note over P,S: === コンシューマ削除 ===
    P->>S: コンシューマ削除要求<br/>（コンシューマID）
    activate S
    S->>S: コンシューマ・カーソル位置を削除
    S->>S: APIクレデンシャルを無効化
    S-->>P: 削除完了
    deactivate S
```

### BUC-026: イベントを取得する

```mermaid
sequenceDiagram
    actor P as プロダクト提供者
    participant S as akashic-ts

    loop ポーリング
        P->>S: イベント取得要求<br/>（コンシューマID・カーソル位置・取得件数上限）
        activate S
        S->>S: コンシューマのクレデンシャルを検証
        S->>S: フィルタ条件に合致するイベントを<br/>カーソル位置から取得
        alt イベントあり
            S-->>P: イベント一覧・次のカーソル位置
            P->>P: イベントを処理
            P->>S: カーソル位置をコミット<br/>（コンシューマID・新カーソル位置）
            S->>S: カーソル位置を更新
            S-->>P: コミット完了
        else イベントなし
            S-->>P: 空レスポンス・現在のカーソル位置
        end
        deactivate S
    end
```

### BUC-027: データを一括取得する

```mermaid
sequenceDiagram
    actor P as プロダクト提供者
    participant S as akashic-ts

    P->>S: 一括取得要求<br/>（エンティティ種別・フィルタ条件・ページネーション）
    activate S
    S->>S: コンシューマのクレデンシャルを検証
    S->>S: 指定エンティティの現在状態を取得
    S-->>P: エンティティ一覧・ページネーション情報
    deactivate S

    Note over P,S: エンティティ種別:<br/>組織 / OU / グループ /<br/>ユーザー / ロール割当
```

### BUC-028: 監査ログを参照する

```mermaid
sequenceDiagram
    actor A as 管理者
    participant S as akashic-ts

    A->>S: 監査ログ検索要求<br/>（期間・イベント種別・組織・ユーザー）
    activate S
    S->>S: 操作者の権限・参照範囲を確認
    alt 基盤提供者
        S->>S: 全組織の監査ログを検索
    else 組織管理者
        S->>S: 自組織の監査ログを検索
    else OU管理者
        S->>S: 担当OU関連の監査ログを検索
    end
    S-->>A: 監査ログ一覧（ページネーション付き）
    deactivate S

    A->>S: 監査ログ詳細要求<br/>（イベントID）
    activate S
    S->>S: 参照権限を確認
    S-->>A: イベント詳細<br/>（集約種別・集約ID・イベント名・<br/>ペイロード・発生日時・操作者）
    deactivate S
```

## イベントストリームの仕組み

```mermaid
graph TB
    subgraph sources["イベント発生源"]
        biz1["BIZ-001: 組織管理\n（EVT-001〜EVT-006）"]
        biz2["BIZ-002: OU管理\n（EVT-007〜EVT-012）"]
        biz3["BIZ-003: グループ管理\n（EVT-013〜EVT-020）"]
        biz4["BIZ-004: ユーザーライフサイクル\n（EVT-021〜EVT-030）"]
        biz5["BIZ-005: ロール割当管理\n（EVT-031〜EVT-032）"]
    end

    store["イベントストア\n（永続化・順序保証）"]

    subgraph consumers["コンシューマ"]
        c1["プロダクトA\n（フィルタ: 全イベント）"]
        c2["プロダクトB\n（フィルタ: ユーザー系のみ）"]
        c3["プロダクトC\n（フィルタ: 特定組織のみ）"]
    end

    audit["監査ログ\n（長期保持）"]

    biz1 --> store
    biz2 --> store
    biz3 --> store
    biz4 --> store
    biz5 --> store

    store -->|"ポーリング\n（カーソルベース）"| c1
    store -->|"ポーリング\n（カーソルベース）"| c2
    store -->|"ポーリング\n（カーソルベース）"| c3
    store --> audit
```

## スコープ外

| 項目 | 説明 |
|------|------|
| Push型配信（Webhook） | 現時点ではPull型のみ。将来的にWebhook配信を追加する可能性あり |
| イベントの変換・加工 | イベントはそのまま配信。コンシューマ側で変換を行う |
| イベントのリプレイ | カーソルを巻き戻すことで過去イベントの再取得は可能だが、専用のリプレイ機能は提供しない |

## 条件一覧

| ID | 条件 | 関連UC |
|----|------|--------|
| COND-023 | 各イベントは一意のeventIdを持ち冪等処理を可能にする | UC-049 |
| COND-024 | 同一集約IDのイベントは発生順に取得。異なる集約間の順序は非保証 | UC-049 |
| COND-025 | イベント保持期間は基盤提供者が設定。期間超過後もログとしては保持 | UC-049, UC-051 |
| COND-026 | 監査ログ参照範囲はアクター権限に応じて制限 | UC-051 |
| COND-027 | コンシューマ名は基盤全体で一意 | UC-045 |
