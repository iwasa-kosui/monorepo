---
type: rdra-context
id: "BIZ-002"
name: "ou-management"
display_name: "組織単位管理"

# システム価値レイヤー
value:
  goals: ["GOAL-001"]
  requirements:
    - id: "REQ-006"
      description: "組織単位を作成できる（表示名・OUコード・親OU・メタデータ）"
      traces_to: ["GOAL-001"]
    - id: "REQ-007"
      description: "組織単位の設定を変更できる（表示名・OUコード・メタデータ）"
      traces_to: ["GOAL-001"]
    - id: "REQ-008"
      description: "組織単位をサブツリーごと別の親OUに移動できる"
      traces_to: ["GOAL-001"]
    - id: "REQ-009"
      description: "組織単位を削除できる（配下OUとロール割当をカスケード削除、ユーザーは削除しない）"
      traces_to: ["GOAL-001"]
    - id: "REQ-010"
      description: "組織単位のツリーを参照できる（一覧・詳細・サブツリー取得）"
      traces_to: ["GOAL-001"]
    - id: "REQ-011"
      description: "組織作成時にルートOUが自動生成される（削除不可）"
      traces_to: ["GOAL-001"]

# 外部環境レイヤー
environment:
  business_usecases:
    - id: "BUC-005"
      name: "組織単位を作成する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-008"]
      description: "親OUを指定してツリーにノードを追加する。表示名・OUコード・メタデータを入力する"
      traces_to: ["REQ-006"]
    - id: "BUC-006"
      name: "組織単位の設定を変更する"
      actors: ["ACTOR-002", "ACTOR-003"]
      description: "組織単位の表示名・OUコード・メタデータを変更する"
      traces_to: ["REQ-007"]
    - id: "BUC-007"
      name: "組織単位を移動する"
      actors: ["ACTOR-002", "ACTOR-003"]
      description: "組織単位をサブツリーごと別の親OUの配下に移動する"
      traces_to: ["REQ-008"]
    - id: "BUC-008"
      name: "組織単位を削除する"
      actors: ["ACTOR-002", "ACTOR-003"]
      description: "組織単位と配下OUおよびロール割当をカスケード削除する。ユーザーは削除しない"
      traces_to: ["REQ-009"]
    - id: "BUC-009"
      name: "組織単位ツリーを参照する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-008"]
      description: "組織単位ツリーの全体・サブツリー・特定OUの詳細を参照する"
      traces_to: ["REQ-010"]

# システム境界レイヤー
boundary:
  usecases:
    - id: "UC-009"
      name: "組織単位を作成する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-008"]
      screens: ["SCR-003"]
      events: ["EVT-007"]
      traces_to: ["BUC-005"]
      description: "親OU・表示名・OUコード・メタデータを受け取り、ツリーにノードを追加する。OUコードは組織内で一意"
    - id: "UC-010"
      name: "組織単位の表示名を変更する"
      actors: ["ACTOR-002", "ACTOR-003"]
      screens: ["SCR-004"]
      events: ["EVT-008"]
      traces_to: ["BUC-006"]
      description: "組織単位の表示名を変更する"
    - id: "UC-011"
      name: "組織単位のOUコードを変更する"
      actors: ["ACTOR-002", "ACTOR-003"]
      screens: ["SCR-004"]
      events: ["EVT-009"]
      traces_to: ["BUC-006"]
      description: "組織単位のOUコードを変更する。組織内での一意性を検証する"
    - id: "UC-012"
      name: "組織単位のメタデータを更新する"
      actors: ["ACTOR-002", "ACTOR-003"]
      screens: ["SCR-004"]
      events: ["EVT-010"]
      traces_to: ["BUC-006"]
      description: "組織単位のメタデータ（key-value）を追加・更新・削除する"
    - id: "UC-013"
      name: "組織単位を移動する"
      actors: ["ACTOR-002", "ACTOR-003"]
      screens: ["SCR-003"]
      events: ["EVT-011"]
      traces_to: ["BUC-007"]
      description: "組織単位とその配下のサブツリー全体を、別の親OUの配下に移動する"
    - id: "UC-014"
      name: "組織単位を削除する"
      actors: ["ACTOR-002", "ACTOR-003"]
      screens: ["SCR-004"]
      events: ["EVT-012"]
      traces_to: ["BUC-008"]
      description: "組織単位と配下OUおよび関連ロール割当をカスケード削除する。ユーザーは削除しない。ルートOUは削除不可"
    - id: "UC-015"
      name: "組織単位ツリーを取得する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-008"]
      screens: ["SCR-003"]
      events: []
      traces_to: ["BUC-009"]
      description: "組織全体のOUツリーまたは指定OUのサブツリーを取得する"
    - id: "UC-016"
      name: "組織単位詳細を取得する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-008"]
      screens: ["SCR-004"]
      events: []
      traces_to: ["BUC-009"]
      description: "特定の組織単位の基本情報・メタデータ・配下サマリを取得する"
  screens:
    - id: "SCR-003"
      name: "組織単位ツリー画面"
      description: "基盤提供者向け管理画面。OUツリーの表示・ノード追加・移動操作を提供"
      information: ["INFO-002"]
    - id: "SCR-004"
      name: "組織単位詳細・編集画面"
      description: "基盤提供者向け管理画面。OUの詳細表示・設定変更・削除操作を提供"
      information: ["INFO-002"]
  events:
    - id: "EVT-007"
      name: "組織単位作成イベント"
      trigger: "UC-009 組織単位作成完了時"
      description: "組織単位が作成されたことを表すドメインイベント。OUの全属性と親OUのIDを含む"
    - id: "EVT-008"
      name: "組織単位表示名変更イベント"
      trigger: "UC-010 表示名変更完了時"
      description: "組織単位の表示名が変更されたことを表すドメインイベント"
    - id: "EVT-009"
      name: "組織単位OUコード変更イベント"
      trigger: "UC-011 OUコード変更完了時"
      description: "組織単位のOUコードが変更されたことを表すドメインイベント"
    - id: "EVT-010"
      name: "組織単位メタデータ更新イベント"
      trigger: "UC-012 メタデータ更新完了時"
      description: "組織単位のメタデータが更新されたことを表すドメインイベント"
    - id: "EVT-011"
      name: "組織単位移動イベント"
      trigger: "UC-013 移動完了時"
      description: "組織単位がサブツリーごと移動されたことを表すドメインイベント。移動元・移動先の親OU IDを含む"
    - id: "EVT-012"
      name: "組織単位削除イベント"
      trigger: "UC-014 削除完了時"
      description: "組織単位が削除されたことを表すドメインイベント。カスケード削除された配下OUとロール割当の情報を含む"

# システムレイヤー
system:
  information: ["INFO-002"]
  states: []
  conditions:
    - id: "COND-006"
      name: "OUコード組織内一意性"
      description: "OUコードは同一組織内で一意でなければならない"
      traces_to: ["UC-009", "UC-011"]
    - id: "COND-007"
      name: "ルートOU削除不可"
      description: "組織作成時に自動生成されるルートOUは削除できない"
      traces_to: ["UC-014"]
    - id: "COND-008"
      name: "移動先の循環参照禁止"
      description: "OUを自身の配下に移動することはできない（循環参照の防止）"
      traces_to: ["UC-013"]
    - id: "COND-009"
      name: "OU削除時ユーザー非削除"
      description: "OU削除時に配下OUとロール割当はカスケード削除するが、ユーザーは削除しない"
      traces_to: ["UC-014"]
  variations: []
---

# BIZ-002: 組織単位管理

## ビジネスコンテキスト図

```mermaid
graph LR
    orgAdmin["ACTOR-002: 組織管理者"]
    ouAdmin["ACTOR-003: 組織単位管理者"]
    salesops["ACTOR-008: セールスオペレーション部門"]
    user["ACTOR-001: ユーザー"]

    subgraph ctx["BIZ-002: 組織単位管理"]
        buc5["BUC-005: 組織単位を\n作成する"]
        buc6["BUC-006: 組織単位の設定を\n変更する"]
        buc7["BUC-007: 組織単位を\n移動する"]
        buc8["BUC-008: 組織単位を\n削除する"]
        buc9["BUC-009: 組織単位ツリーを\n参照する"]
    end

    orgAdmin --> buc5
    orgAdmin --> buc6
    orgAdmin --> buc7
    orgAdmin --> buc8
    orgAdmin --> buc9
    ouAdmin --> buc5
    ouAdmin --> buc6
    ouAdmin --> buc7
    ouAdmin --> buc8
    ouAdmin --> buc9
    salesops --> buc5
    salesops --> buc9
    user --> buc9
```

## 業務フロー

### BUC-005: 組織単位を作成する

```mermaid
sequenceDiagram
    actor Admin as 組織管理者<br/>/ 組織単位管理者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: OU作成要求<br/>（親OU・表示名・OUコード・メタデータ）
    activate S
    S->>S: 親OUの存在を確認
    S->>S: OUコードの組織内一意性を検証
    S->>S: 操作者が親OUに対する管理権限を持つか確認
    alt 親OUが存在しない
        S-->>Admin: エラー（親OU不存在）
    else OUコードが重複
        S-->>Admin: エラー（コード重複）
    else 権限不足
        S-->>Admin: エラー（権限不足）
    else 正常
        S->>S: 組織単位を作成
        S->>EV: ドメインイベント「組織単位作成」を発行
        S-->>Admin: 作成完了
    end
    deactivate S
```

### BUC-007: 組織単位を移動する

```mermaid
sequenceDiagram
    actor Admin as 組織管理者<br/>/ 組織単位管理者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: OU移動要求<br/>（対象OU・移動先親OU）
    activate S
    S->>S: 対象OUがルートOUでないことを確認
    S->>S: 移動先親OUの存在を確認
    S->>S: 循環参照にならないことを検証<br/>（移動先が対象OUの配下でない）
    S->>S: 操作者が対象OUと移動先親OUの<br/>両方に管理権限を持つか確認
    alt ルートOUの移動
        S-->>Admin: エラー（ルートOU移動不可）
    else 移動先が配下（循環参照）
        S-->>Admin: エラー（循環参照）
    else 権限不足
        S-->>Admin: エラー（権限不足）
    else 正常
        S->>S: 対象OUとサブツリー全体を<br/>移動先親OUの配下に移動
        S->>EV: ドメインイベント「組織単位移動」を発行
        S-->>Admin: 移動完了
    end
    deactivate S
```

### BUC-008: 組織単位を削除する

```mermaid
sequenceDiagram
    actor Admin as 組織管理者<br/>/ 組織単位管理者
    participant S as akashic-ts
    participant AUTH as ロール割当管理<br/>（BIZ-005）
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: OU削除要求<br/>（対象OU）
    activate S
    S->>S: 対象OUがルートOUでないことを確認
    S->>S: 操作者が対象OUに対する管理権限を持つか確認
    alt ルートOUの削除
        S-->>Admin: エラー（ルートOU削除不可）
    else 権限不足
        S-->>Admin: エラー（権限不足）
    else 正常
        S->>S: 配下OUを再帰的にカスケード削除
        S->>AUTH: 削除されたOUに対するロール割当を削除
        Note over S: ユーザーは削除しない
        S->>EV: ドメインイベント「組織単位削除」を発行
        S-->>Admin: 削除完了
    end
    deactivate S
```

### BUC-006: 組織単位の設定を変更する

```mermaid
sequenceDiagram
    actor Admin as 組織管理者<br/>/ 組織単位管理者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: OU設定変更要求<br/>（表示名 / OUコード / メタデータ）
    activate S
    S->>S: 操作者が対象OUに対する管理権限を持つか確認
    alt OUコード変更の場合
        S->>S: 新コードの組織内一意性を検証
        alt コードが重複
            S-->>Admin: エラー（コード重複）
        else 正常
            S->>S: 設定を更新
            S->>EV: ドメインイベント「OU設定変更」を発行
            S-->>Admin: 変更完了
        end
    else 表示名 / メタデータ変更の場合
        S->>S: バリデーション
        S->>S: 設定を更新
        S->>EV: ドメインイベント「OU設定変更」を発行
        S-->>Admin: 変更完了
    end
    deactivate S
```

### BUC-009: 組織単位ツリーを参照する

```mermaid
sequenceDiagram
    actor User as ユーザー / 管理者
    participant S as akashic-ts

    Note over User,S: === ツリー全体取得 ===
    User->>S: OUツリー取得要求（組織ID）
    activate S
    S->>S: 操作者の権限に応じて参照範囲を制限
    S-->>User: OUツリー
    deactivate S

    Note over User,S: === サブツリー取得 ===
    User->>S: サブツリー取得要求（OU ID）
    activate S
    S-->>User: 指定OUをルートとするサブツリー
    deactivate S

    Note over User,S: === OU詳細取得 ===
    User->>S: OU詳細取得要求（OU ID）
    activate S
    S-->>User: OU情報<br/>（基本情報・メタデータ・配下サマリ）
    deactivate S
```

## 条件一覧

| ID | 条件 | 関連UC |
|----|------|--------|
| COND-006 | OUコードは同一組織内で一意 | UC-009, UC-011 |
| COND-007 | ルートOUは削除不可 | UC-014 |
| COND-008 | 移動先が配下の場合は循環参照として拒否 | UC-013 |
| COND-009 | OU削除時、配下OUとロール割当はカスケード削除するがユーザーは削除しない | UC-014 |
