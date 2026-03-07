---
type: rdra-context
id: "BIZ-003"
name: "group-management"
display_name: "グループ管理"

# システム価値レイヤー
value:
  goals: ["GOAL-001"]
  requirements:
    - id: "REQ-012"
      description: "グループを作成できる（グループ名・グループコード・メタデータ）"
      traces_to: ["GOAL-001"]
    - id: "REQ-013"
      description: "グループの設定を変更できる（グループ名・グループコード・メタデータ）"
      traces_to: ["GOAL-001"]
    - id: "REQ-014"
      description: "グループにOUを追加・削除・並替できる（順序付き。1つのOUは複数グループに所属可能）"
      traces_to: ["GOAL-001"]
    - id: "REQ-015"
      description: "グループを削除できる（グループに対するロール割当も削除される）"
      traces_to: ["GOAL-001"]
    - id: "REQ-016"
      description: "グループの一覧・詳細を参照できる（構成OU一覧含む）"
      traces_to: ["GOAL-001"]

# 外部環境レイヤー
environment:
  business_usecases:
    - id: "BUC-010"
      name: "グループを作成する"
      actors: ["ACTOR-002", "ACTOR-004"]
      description: "グループ名・グループコード・メタデータを入力してグループを作成する"
      traces_to: ["REQ-012"]
    - id: "BUC-011"
      name: "グループの設定を変更する"
      actors: ["ACTOR-002", "ACTOR-004"]
      description: "グループ名・グループコード・メタデータを変更する"
      traces_to: ["REQ-013"]
    - id: "BUC-012"
      name: "グループのOU構成を変更する"
      actors: ["ACTOR-002", "ACTOR-004"]
      description: "グループにOUを追加・削除・並替する"
      traces_to: ["REQ-014"]
    - id: "BUC-013"
      name: "グループを削除する"
      actors: ["ACTOR-002", "ACTOR-004"]
      description: "グループを削除する。グループに対するロール割当も削除される"
      traces_to: ["REQ-015"]
    - id: "BUC-014"
      name: "グループを参照する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-004"]
      description: "グループの一覧・詳細（構成OU一覧含む）を参照する"
      traces_to: ["REQ-016"]

# システム境界レイヤー
boundary:
  usecases:
    - id: "UC-017"
      name: "グループを作成する"
      actors: ["ACTOR-002", "ACTOR-004"]
      screens: ["SCR-005"]
      events: ["EVT-013"]
      traces_to: ["BUC-010"]
      description: "グループ名・グループコード・メタデータを受け取り、グループを作成する。グループコードは組織内で一意"
    - id: "UC-018"
      name: "グループの表示名を変更する"
      actors: ["ACTOR-002", "ACTOR-004"]
      screens: ["SCR-006"]
      events: ["EVT-014"]
      traces_to: ["BUC-011"]
      description: "グループの表示名を変更する"
    - id: "UC-019"
      name: "グループのコードを変更する"
      actors: ["ACTOR-002", "ACTOR-004"]
      screens: ["SCR-006"]
      events: ["EVT-015"]
      traces_to: ["BUC-011"]
      description: "グループのコードを変更する。組織内での一意性を検証する"
    - id: "UC-020"
      name: "グループのメタデータを更新する"
      actors: ["ACTOR-002", "ACTOR-004"]
      screens: ["SCR-006"]
      events: ["EVT-016"]
      traces_to: ["BUC-011"]
      description: "グループのメタデータ（key-value）を追加・更新・削除する"
    - id: "UC-021"
      name: "グループにOUを追加する"
      actors: ["ACTOR-002", "ACTOR-004"]
      screens: ["SCR-006"]
      events: ["EVT-017"]
      traces_to: ["BUC-012"]
      description: "グループにOUを指定位置に追加する。既にグループに含まれるOUは追加不可"
    - id: "UC-022"
      name: "グループからOUを削除する"
      actors: ["ACTOR-002", "ACTOR-004"]
      screens: ["SCR-006"]
      events: ["EVT-018"]
      traces_to: ["BUC-012"]
      description: "グループからOUを削除する。残りのOUの順序は詰められる"
    - id: "UC-023"
      name: "グループ内のOU順序を変更する"
      actors: ["ACTOR-002", "ACTOR-004"]
      screens: ["SCR-006"]
      events: ["EVT-019"]
      traces_to: ["BUC-012"]
      description: "グループ内のOUの順序を変更する"
    - id: "UC-024"
      name: "グループを削除する"
      actors: ["ACTOR-002", "ACTOR-004"]
      screens: ["SCR-006"]
      events: ["EVT-020"]
      traces_to: ["BUC-013"]
      description: "グループを削除する。グループに対するロール割当も削除される"
    - id: "UC-025"
      name: "グループ一覧を取得する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-004"]
      screens: ["SCR-005"]
      events: []
      traces_to: ["BUC-014"]
      description: "組織内のグループ一覧を取得する。検索・フィルタ・ページネーション付き"
    - id: "UC-026"
      name: "グループ詳細を取得する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-004"]
      screens: ["SCR-006"]
      events: []
      traces_to: ["BUC-014"]
      description: "特定のグループの基本情報・メタデータ・構成OU一覧（順序付き）を取得する"
  screens:
    - id: "SCR-005"
      name: "グループ一覧画面"
      description: "基盤提供者向け管理画面。グループの検索・一覧表示・新規作成への導線を提供"
      information: ["INFO-003"]
    - id: "SCR-006"
      name: "グループ詳細・編集画面"
      description: "基盤提供者向け管理画面。グループの詳細表示・設定変更・OU構成管理・削除操作を提供"
      information: ["INFO-003"]
  events:
    - id: "EVT-013"
      name: "グループ作成イベント"
      trigger: "UC-017 グループ作成完了時"
      description: "グループが作成されたことを表すドメインイベント"
    - id: "EVT-014"
      name: "グループ表示名変更イベント"
      trigger: "UC-018 表示名変更完了時"
      description: "グループの表示名が変更されたことを表すドメインイベント"
    - id: "EVT-015"
      name: "グループコード変更イベント"
      trigger: "UC-019 コード変更完了時"
      description: "グループのコードが変更されたことを表すドメインイベント"
    - id: "EVT-016"
      name: "グループメタデータ更新イベント"
      trigger: "UC-020 メタデータ更新完了時"
      description: "グループのメタデータが更新されたことを表すドメインイベント"
    - id: "EVT-017"
      name: "グループOU追加イベント"
      trigger: "UC-021 OU追加完了時"
      description: "グループにOUが追加されたことを表すドメインイベント"
    - id: "EVT-018"
      name: "グループOU削除イベント"
      trigger: "UC-022 OU削除完了時"
      description: "グループからOUが削除されたことを表すドメインイベント"
    - id: "EVT-019"
      name: "グループOU順序変更イベント"
      trigger: "UC-023 順序変更完了時"
      description: "グループ内のOUの順序が変更されたことを表すドメインイベント"
    - id: "EVT-020"
      name: "グループ削除イベント"
      trigger: "UC-024 グループ削除完了時"
      description: "グループが削除されたことを表すドメインイベント"

# システムレイヤー
system:
  information: ["INFO-003"]
  states: []
  conditions:
    - id: "COND-010"
      name: "グループコード組織内一意性"
      description: "グループコードは同一組織内で一意でなければならない"
      traces_to: ["UC-017", "UC-019"]
    - id: "COND-011"
      name: "グループ内OU重複禁止"
      description: "同一グループに同じOUを複数回追加できない"
      traces_to: ["UC-021"]
    - id: "COND-012"
      name: "OUの複数グループ所属可"
      description: "1つのOUは複数のグループに所属できる"
      traces_to: ["UC-021"]
  variations: []
---

# BIZ-003: グループ管理

## ビジネスコンテキスト図

```mermaid
graph LR
    orgAdmin["ACTOR-002: 組織管理者"]
    grpAdmin["ACTOR-004: グループ管理者"]
    user["ACTOR-001: ユーザー"]

    subgraph ctx["BIZ-003: グループ管理"]
        buc10["BUC-010: グループを\n作成する"]
        buc11["BUC-011: グループの設定を\n変更する"]
        buc12["BUC-012: グループのOU構成を\n変更する"]
        buc13["BUC-013: グループを\n削除する"]
        buc14["BUC-014: グループを\n参照する"]
    end

    orgAdmin --> buc10
    orgAdmin --> buc11
    orgAdmin --> buc12
    orgAdmin --> buc13
    orgAdmin --> buc14
    grpAdmin --> buc10
    grpAdmin --> buc11
    grpAdmin --> buc12
    grpAdmin --> buc13
    grpAdmin --> buc14
    user --> buc14
```

## 業務フロー

### BUC-010: グループを作成する

```mermaid
sequenceDiagram
    actor Admin as 組織管理者<br/>/ グループ管理者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: グループ作成要求<br/>（グループ名・グループコード・メタデータ）
    activate S
    S->>S: グループコードの組織内一意性を検証
    alt コードが重複
        S-->>Admin: エラー（コード重複）
    else 正常
        S->>S: グループを作成（OU構成は空）
        S->>EV: ドメインイベント「グループ作成」を発行
        S-->>Admin: 作成完了
    end
    deactivate S
```

### BUC-012: グループのOU構成を変更する

```mermaid
sequenceDiagram
    actor Admin as 組織管理者<br/>/ グループ管理者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Note over Admin,EV: === OU追加 ===
    Admin->>S: OU追加要求<br/>（グループID・OU ID・挿入位置）
    activate S
    S->>S: OUの存在を確認
    S->>S: グループ内でのOU重複を検証
    alt OUが存在しない
        S-->>Admin: エラー（OU不存在）
    else OUが既にグループに所属
        S-->>Admin: エラー（重複）
    else 正常
        S->>S: 指定位置にOUを追加
        S->>EV: ドメインイベント「グループOU追加」を発行
        S-->>Admin: 追加完了
    end
    deactivate S

    Note over Admin,EV: === OU削除 ===
    Admin->>S: OU削除要求<br/>（グループID・OU ID）
    activate S
    S->>S: OUをグループから削除、残りの順序を詰める
    S->>EV: ドメインイベント「グループOU削除」を発行
    S-->>Admin: 削除完了
    deactivate S

    Note over Admin,EV: === 順序変更 ===
    Admin->>S: 順序変更要求<br/>（グループID・新しいOU順序リスト）
    activate S
    S->>S: 順序を更新
    S->>EV: ドメインイベント「グループOU順序変更」を発行
    S-->>Admin: 変更完了
    deactivate S
```

### BUC-013: グループを削除する

```mermaid
sequenceDiagram
    actor Admin as 組織管理者<br/>/ グループ管理者
    participant S as akashic-ts
    participant AUTH as 認可<br/>（BIZ-005）
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: グループ削除要求<br/>（グループID）
    activate S
    S->>S: 操作者がグループに対する管理権限を持つか確認
    alt 権限不足
        S-->>Admin: エラー（権限不足）
    else 正常
        S->>AUTH: グループに対するロール割当を削除
        S->>S: グループを削除
        S->>EV: ドメインイベント「グループ削除」を発行
        S-->>Admin: 削除完了
    end
    deactivate S
```

## 条件一覧

| ID | 条件 | 関連UC |
|----|------|--------|
| COND-010 | グループコードは同一組織内で一意 | UC-017, UC-019 |
| COND-011 | 同一グループに同じOUを複数回追加不可 | UC-021 |
| COND-012 | 1つのOUは複数グループに所属可能 | UC-021 |
