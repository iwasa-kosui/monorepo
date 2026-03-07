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
      description: "イベント配信アダプターによるPush配信でドメインイベントをリアルタイムに取得できる"
      traces_to: ["GOAL-004"]
    - id: "REQ-030"
      description: "サブスクリプションごとにイベントパターンでフィルタ条件を設定できる（イベント種別・コンテキスト・組織）"
      traces_to: ["GOAL-004"]
    - id: "REQ-031"
      description: "スナップショットアダプターにより、ある時点で一貫性のあるデータを取得できる（マイクロバッチ生成）"
      traces_to: ["GOAL-004"]
    - id: "REQ-032"
      description: "監査ログを検索・参照できる（基盤提供者は全組織、組織管理者は自組織、OU管理者は担当OU関連）"
      traces_to: ["GOAL-003"]

# 外部環境レイヤー
environment:
  business_usecases:
    - id: "BUC-025"
      name: "イベントサブスクリプションを管理する"
      actors: ["ACTOR-005", "ACTOR-006"]
      description: "イベントサブスクリプションを登録・設定変更・削除する。サブスクリプションごとにイベントパターン（フィルタ条件）を設定可能"
      traces_to: ["REQ-029", "REQ-030"]
    - id: "BUC-026"
      name: "スナップショットからデータを取得する"
      actors: ["ACTOR-005"]
      description: "スナップショットを定期的に取得し、一貫性のあるデータでリレーションシップを構築する。イベント配信アダプターを使用しないプロダクトはこれのみでデータ取得が完結する。スナップショット取得用SDKを提供する"
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
      name: "サブスクリプションを登録する"
      actors: ["ACTOR-005", "ACTOR-006"]
      screens: ["SCR-010"]
      events: ["EVT-033"]
      traces_to: ["BUC-025"]
      description: "サブスクリプション名・配信先設定・イベントパターン（イベント種別・コンテキスト・組織）を受け取り、サブスクリプションを登録する。配信アダプターを通じて配信先への疎通確認を行う"
    - id: "UC-046"
      name: "サブスクリプションのイベントパターンを変更する"
      actors: ["ACTOR-005", "ACTOR-006"]
      screens: ["SCR-010"]
      events: ["EVT-034"]
      traces_to: ["BUC-025"]
      description: "サブスクリプションのイベントパターン（イベント種別・コンテキスト・組織）を変更する"
    - id: "UC-047"
      name: "サブスクリプションを削除する"
      actors: ["ACTOR-005", "ACTOR-006"]
      screens: ["SCR-010"]
      events: ["EVT-035"]
      traces_to: ["BUC-025"]
      description: "サブスクリプションを削除する。配信アダプター上のリソースも合わせて削除される"
    - id: "UC-048"
      name: "サブスクリプション一覧を取得する"
      actors: ["ACTOR-005", "ACTOR-006"]
      screens: ["SCR-010"]
      events: []
      traces_to: ["BUC-025"]
      description: "登録済みのサブスクリプション一覧（名前・イベントパターン・配信先・ステータス）を取得する"
    - id: "UC-050"
      name: "スナップショットを取得する"
      actors: ["ACTOR-005"]
      screens: []
      events: []
      traces_to: ["BUC-026"]
      description: "利用可能なスナップショットバージョン一覧を参照し、指定バージョンのスナップショットデータを取得する。各スナップショットにはeventSequenceNumberが紐づいており、イベント配信アダプターとの接続点として利用できる"
    - id: "UC-051"
      name: "監査ログを検索する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006"]
      screens: ["SCR-011"]
      events: []
      traces_to: ["BUC-028"]
      description: "期間・イベント種別・コンテキスト・組織・ユーザーで監査ログを検索する。基盤提供者は全組織、組織管理者は自組織、OU管理者は担当OU関連に限定"
    - id: "UC-052"
      name: "スナップショットを生成する"
      actors: []
      screens: []
      events: []
      traces_to: ["BUC-026"]
      description: "マイクロバッチでエンティティ（組織・OU・グループ・ユーザー・ロール割当）の現在状態をスナップショットアダプターを通じて書き出す。一貫性はアダプターのトランザクション機能が保証する。スナップショットにはその時点のeventSequenceNumberを記録する"
    - id: "UC-053"
      name: "イベント配信の運用状況を監視する"
      actors: ["ACTOR-006"]
      screens: ["SCR-010"]
      events: []
      traces_to: ["BUC-025"]
      description: "イベント配信の成功・失敗状況を監視する。配信失敗イベントの確認・再送、配信先の健全性ステータスの確認を行う"
  screens:
    - id: "SCR-010"
      name: "サブスクリプション管理画面"
      description: "基盤提供者向け管理画面。サブスクリプションの登録・イベントパターン設定・削除・ステータス確認・配信状況監視を提供"
      information: ["INFO-006"]
    - id: "SCR-011"
      name: "監査ログ画面"
      description: "基盤提供者・組織管理者・OU管理者向け画面。ドメインイベントの検索・詳細表示。アクターの権限に応じて参照範囲を制限"
      information: ["INFO-001", "INFO-002", "INFO-003", "INFO-004", "INFO-005", "INFO-009"]
  events:
    - id: "EVT-033"
      name: "サブスクリプション登録イベント"
      trigger: "UC-045 サブスクリプション登録完了時"
      description: "イベントサブスクリプションが登録されたことを表すドメインイベント"
    - id: "EVT-034"
      name: "サブスクリプションパターン変更イベント"
      trigger: "UC-046 イベントパターン変更完了時"
      description: "イベントサブスクリプションのイベントパターンが変更されたことを表すドメインイベント"
    - id: "EVT-035"
      name: "サブスクリプション削除イベント"
      trigger: "UC-047 サブスクリプション削除完了時"
      description: "イベントサブスクリプションが削除されたことを表すドメインイベント"

# システムレイヤー
system:
  information: ["INFO-006", "INFO-009", "INFO-010"]
  states: []
  conditions:
    - id: "COND-023"
      name: "イベントIDによる冪等性"
      description: "各ドメインイベントは一意のeventIdを持ち、at-least-once配信に対応するため、プロダクト側でeventIdベースの冪等処理が必要"
      traces_to: ["UC-045"]
    - id: "COND-024"
      name: "順序非保証と集約バージョン番号によるリオーダリング"
      description: "Push配信ではイベントの順序を保証しない。各ドメインイベントには集約バージョン番号（aggregateVersion）が付与される。プロダクト側はaggregateVersionに基づいてリオーダリングおよび欠損検出を行う。スナップショットはポイントインタイムの一貫データを提供するため順序の問題は発生しない"
      traces_to: ["UC-045"]
    - id: "COND-025"
      name: "データ保持期間"
      description: "イベントアーカイブおよびスナップショットの保持期間は基盤提供者が設定する。保持期間を過ぎたスナップショットは削除されるが、監査ログとしてのイベントは別途保持される"
      traces_to: ["UC-050", "UC-051"]
    - id: "COND-026"
      name: "監査ログ参照範囲の制限"
      description: "監査ログの参照範囲はアクターの権限に応じて制限される。基盤提供者は全組織、組織管理者は自組織、OU管理者は担当OU関連のイベントのみ"
      traces_to: ["UC-051"]
    - id: "COND-027"
      name: "サブスクリプション名の一意性"
      description: "サブスクリプション名は基盤全体で一意でなければならない"
      traces_to: ["UC-045"]
    - id: "COND-028"
      name: "スナップショットの一貫性保証"
      description: "スナップショットの一貫性（原子性・スナップショットアイソレーション）はスナップショットアダプターが保証する。プロダクト側はエンティティ間のリレーションシップを安全に構築できる"
      traces_to: ["UC-052"]
    - id: "COND-029"
      name: "スナップショットとイベントストリームの接続点"
      description: "各スナップショットにはeventSequenceNumberが記録される。スナップショット取得後、そのsequenceNumber以降のイベントを処理すれば整合的な最新状態を構築できる"
      traces_to: ["UC-050", "UC-052"]
    - id: "COND-030"
      name: "スナップショット生成間隔"
      description: "スナップショットの生成間隔は基盤提供者が設定する（デフォルト: 15〜60分、最小間隔: 5分）。上流IdPのSCIM同期間隔（30〜40分）を考慮し、それ以上の頻度で生成しても実用上の意味は薄い。保持世代数も基盤提供者が設定する（デフォルト: 直近24時間分）"
      traces_to: ["UC-052"]
    - id: "COND-031"
      name: "配信アダプターの認証・認可責任"
      description: "イベント配信先の認証・認可は配信アダプターの責任とする。具体的な認証手段はアダプターの実装に依存し、RDRA仕様では規定しない"
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
        buc25["BUC-025: イベント\nサブスクリプションを管理する"]
        buc26["BUC-026: スナップショットから\nデータを取得する"]
        buc28["BUC-028: 監査ログを\n参照する"]
    end

    product --> buc25
    product --> buc26
    platform --> buc25
    platform --> buc28
    orgAdmin --> buc28
    ouAdmin --> buc28
```

## アダプターモデルによるイベント配信・データ取得

```mermaid
graph TB
    subgraph sources["イベント発生源"]
        biz1["BIZ-001: 組織管理\n（EVT-001〜EVT-006）"]
        biz2["BIZ-002: OU管理\n（EVT-007〜EVT-012）"]
        biz3["BIZ-003: グループ管理\n（EVT-013〜EVT-020）"]
        biz4["BIZ-004: ユーザーライフサイクル\n（EVT-021〜EVT-030）"]
        biz5["BIZ-005: ロール割当管理\n（EVT-031〜EVT-032）"]
    end

    store["イベントストア\n（永続化）"]
    audit["監査ログ\n（長期保持）"]

    subgraph adapters["アダプター"]
        da["イベント配信アダプター\n（Push型配信）"]
        sa["スナップショットアダプター\n（マイクロバッチ書き出し）"]
    end

    subgraph pattern1["パターン1: リアルタイム"]
        p1["プロダクトA\n（Push型・イベント単位）"]
        p2["プロダクトB\n（Push型・イベント単位）"]
    end

    subgraph pattern2["パターン2: 定期取得"]
        p3["プロダクトC\n（スナップショット取得）"]
    end

    biz1 --> store
    biz2 --> store
    biz3 --> store
    biz4 --> store
    biz5 --> store
    store --> audit

    store --> da
    store --> sa

    da -->|"Push配信\n（at-least-once）"| p1
    da -->|"Push配信\n（at-least-once）"| p2
    sa -->|"スナップショット取得\n（SDK経由）"| p3
```

## 業務フロー

### BUC-025: イベントサブスクリプションを管理する

```mermaid
sequenceDiagram
    actor P as プロダクト提供者<br/>/ 基盤提供者
    participant S as akashic-ts

    Note over P,S: === サブスクリプション登録 ===
    P->>S: サブスクリプション登録要求<br/>（サブスクリプション名・配信先設定・イベントパターン）
    activate S
    S->>S: サブスクリプション名の一意性を検証
    alt サブスクリプション名が重複
        S-->>P: エラー（名前重複）
    else 正常
        S->>S: 配信アダプターを通じて配信先への疎通確認
        alt 疎通失敗
            S-->>P: エラー（配信先到達不可）
        else 疎通成功
            S->>S: サブスクリプションを登録
            S-->>P: 登録完了（サブスクリプションID）
        end
    end
    deactivate S

    Note over P,S: === イベントパターン変更 ===
    P->>S: イベントパターン変更要求<br/>（サブスクリプションID・新イベントパターン）
    activate S
    S->>S: イベントパターンを更新
    S-->>P: 変更完了
    deactivate S

    Note over P,S: === サブスクリプション削除 ===
    P->>S: サブスクリプション削除要求<br/>（サブスクリプションID）
    activate S
    S->>S: サブスクリプションを削除
    S->>S: 配信アダプター上のリソースを削除
    S-->>P: 削除完了
    deactivate S
```

### BUC-026: スナップショットからデータを取得する

```mermaid
sequenceDiagram
    actor P as プロダクト提供者
    participant S as akashic-ts
    participant SA as スナップショット<br/>アダプター

    Note over P,S: === スナップショット一覧参照 ===
    P->>S: スナップショットバージョン一覧要求
    activate S
    S-->>P: バージョン一覧<br/>（snapshotVersion・eventSequenceNumber・status・createdAt）
    deactivate S

    Note over P,SA: === スナップショットデータ取得（SDK経由） ===
    P->>SA: スナップショットデータ取得<br/>（snapshotVersion・エンティティ種別）
    activate SA
    SA-->>P: エンティティデータ<br/>（組織・OU・グループ・ユーザー・ロール割当）
    deactivate SA

    Note over P: eventSequenceNumber以降の<br/>イベントを処理すれば<br/>整合的な最新状態を構築可能
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

## スコープ外

| 項目 | 説明 |
|------|------|
| イベントの変換・加工 | イベントはそのまま配信。プロダクト側で変換を行う |
| アダプター固有の設計 | ペイロードサイズ制限、transitive routing制限、cross-account targets等は別途アダプター文書に記載 |

## 条件一覧

| ID | 条件 | 関連UC |
|----|------|--------|
| COND-023 | 各イベントは一意のeventIdを持ちat-least-once配信に対応する冪等処理が必要 | UC-045 |
| COND-024 | Push配信は順序非保証。aggregateVersionによるリオーダリング・欠損検出が必要 | UC-045 |
| COND-025 | イベントアーカイブ・スナップショットの保持期間は基盤提供者が設定 | UC-050, UC-051 |
| COND-026 | 監査ログ参照範囲はアクター権限に応じて制限 | UC-051 |
| COND-027 | サブスクリプション名は基盤全体で一意 | UC-045 |
| COND-028 | スナップショットの一貫性はアダプターが保証 | UC-052 |
| COND-029 | スナップショットのeventSequenceNumberでイベントストリームと接続 | UC-050, UC-052 |
| COND-030 | スナップショット生成間隔は基盤提供者が設定（デフォルト: 15〜60分） | UC-052 |
| COND-031 | 配信先の認証・認可は配信アダプターの責任 | UC-045 |
