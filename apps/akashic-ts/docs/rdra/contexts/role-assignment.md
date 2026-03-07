---
type: rdra-context
id: "BIZ-005"
name: "role-assignment"
display_name: "ロール割当管理"

# システム価値レイヤー
value:
  goals: ["GOAL-002", "GOAL-005"]
  requirements:
    - id: "REQ-024"
      description: "ユーザーにOU（組織単位）またはグループに対するロールを割り当てできる"
      traces_to: ["GOAL-002", "GOAL-005"]
    - id: "REQ-025"
      description: "ロール割当を取り消しできる"
      traces_to: ["GOAL-002", "GOAL-005"]
    - id: "REQ-026"
      description: "ロール割当の一覧を参照できる（ユーザー別・OU別・グループ別）"
      traces_to: ["GOAL-002", "GOAL-005"]
    - id: "REQ-027"
      description: "ロール名の定義・パーミッション定義・アクセス制御評価は外部システムに委ね、基盤はロール割当の管理のみ行う"
      traces_to: ["GOAL-005"]

# 外部環境レイヤー
environment:
  business_usecases:
    - id: "BUC-022"
      name: "ロールを割り当てる"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-004", "ACTOR-006"]
      description: "ユーザーにOU（組織単位）またはグループに対するロールを割り当てる。ロール名は任意の文字列"
      traces_to: ["REQ-024"]
    - id: "BUC-023"
      name: "ロール割当を取り消す"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-004", "ACTOR-006"]
      description: "ユーザーのOU（組織単位）またはグループに対するロール割当を取り消す"
      traces_to: ["REQ-025"]
    - id: "BUC-024"
      name: "ロール割当を参照する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-004", "ACTOR-005", "ACTOR-006"]
      description: "ロール割当の一覧を参照する。ユーザー別・OU別・グループ別にフィルタ可能"
      traces_to: ["REQ-026"]

# システム境界レイヤー
boundary:
  usecases:
    - id: "UC-039"
      name: "ユーザーにOUに対するロールを割り当てる"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006"]
      screens: ["SCR-009"]
      events: ["EVT-031"]
      traces_to: ["BUC-022"]
      description: "ユーザーID・OU ID・ロール名を受け取り、ロール割当を作成する。同一ユーザー・同一OU・同一ロール名の重複は不可"
    - id: "UC-040"
      name: "ユーザーにグループに対するロールを割り当てる"
      actors: ["ACTOR-002", "ACTOR-004", "ACTOR-006"]
      screens: ["SCR-009"]
      events: ["EVT-031"]
      traces_to: ["BUC-022"]
      description: "ユーザーID・グループID・ロール名を受け取り、ロール割当を作成する。同一ユーザー・同一グループ・同一ロール名の重複は不可"
    - id: "UC-041"
      name: "OUに対するロール割当を取り消す"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006"]
      screens: ["SCR-009"]
      events: ["EVT-032"]
      traces_to: ["BUC-023"]
      description: "指定されたロール割当（ユーザー・OU・ロール名）を削除する"
    - id: "UC-042"
      name: "グループに対するロール割当を取り消す"
      actors: ["ACTOR-002", "ACTOR-004", "ACTOR-006"]
      screens: ["SCR-009"]
      events: ["EVT-032"]
      traces_to: ["BUC-023"]
      description: "指定されたロール割当（ユーザー・グループ・ロール名）を削除する"
    - id: "UC-043"
      name: "ロール割当一覧を取得する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-004", "ACTOR-005", "ACTOR-006"]
      screens: ["SCR-009"]
      events: []
      traces_to: ["BUC-024"]
      description: "OU別・グループ別・ロール名別にロール割当一覧を取得する。ページネーション付き"
    - id: "UC-044"
      name: "ユーザーのロール割当一覧を取得する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-004", "ACTOR-005", "ACTOR-006"]
      screens: ["SCR-009"]
      events: []
      traces_to: ["BUC-024"]
      description: "特定ユーザーのロール割当一覧（OU・グループ・ロール名）を取得する"
  screens:
    - id: "SCR-009"
      name: "ロール割当管理画面"
      description: "基盤提供者向け管理画面。ロール割当の検索・一覧表示・割当作成・割当取消を提供。ユーザー詳細画面やOU/グループ詳細画面からも遷移可能"
      information: ["INFO-005"]
  events:
    - id: "EVT-031"
      name: "ロール割当作成イベント"
      trigger: "UC-039/UC-040 ロール割当完了時"
      description: "ロールが割り当てられたことを表すドメインイベント。ユーザーID・ターゲット種別（OU/グループ）・ターゲットID・ロール名を含む"
    - id: "EVT-032"
      name: "ロール割当削除イベント"
      trigger: "UC-041/UC-042 ロール割当取消完了時"
      description: "ロール割当が取り消されたことを表すドメインイベント"

# システムレイヤー
system:
  information: ["INFO-005"]
  states: []
  conditions:
    - id: "COND-019"
      name: "同一割当の重複禁止"
      description: "同一ユーザー・同一ターゲット（OU/グループ）・同一ロール名の組み合わせは一意でなければならない"
      traces_to: ["UC-039", "UC-040"]
    - id: "COND-020"
      name: "ロール名は外部定義"
      description: "ロール名はakashic-tsが定義・管理せず、外部から任意の文字列として受け取る。パーミッションの定義やアクセス制御の評価も外部に委ねる"
      traces_to: []
    - id: "COND-021"
      name: "割当対象はOUまたはグループ"
      description: "ロール割当の対象はOUまたはグループのいずれか。組織全体への割当はルートOUへの割当で代替する"
      traces_to: ["UC-039", "UC-040"]
    - id: "COND-022"
      name: "ターゲット存在確認"
      description: "ロール割当時に、対象のユーザー・OU・グループが存在し有効であることを確認する"
      traces_to: ["UC-039", "UC-040"]
  variations: []
---

# BIZ-005: ロール割当管理

## ビジネスコンテキスト図

```mermaid
graph LR
    orgAdmin["ACTOR-002: 組織管理者"]
    ouAdmin["ACTOR-003: 組織単位管理者"]
    grpAdmin["ACTOR-004: グループ管理者"]
    product["ACTOR-005: プロダクト提供者"]
    platform["ACTOR-006: 基盤提供者"]
    user["ACTOR-001: ユーザー"]

    subgraph ctx["BIZ-005: ロール割当管理"]
        buc22["BUC-022: ロールを\n割り当てる"]
        buc23["BUC-023: ロール割当を\n取り消す"]
        buc24["BUC-024: ロール割当を\n参照する"]
    end

    orgAdmin --> buc22
    orgAdmin --> buc23
    orgAdmin --> buc24
    ouAdmin --> buc22
    ouAdmin --> buc23
    ouAdmin --> buc24
    grpAdmin --> buc22
    grpAdmin --> buc23
    grpAdmin --> buc24
    platform --> buc22
    platform --> buc23
    platform --> buc24
    product --> buc24
    user --> buc24
```

## 業務フロー

### BUC-022: ロールを割り当てる

```mermaid
sequenceDiagram
    actor Admin as 管理者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: ロール割当要求<br/>（ユーザーID・ターゲット種別・ターゲットID・ロール名）
    activate S
    S->>S: 操作者の権限を確認
    S->>S: ユーザーの存在・有効性を確認
    S->>S: ターゲット（OU/グループ）の存在を確認
    S->>S: 同一割当の重複を検証
    alt 権限不足
        S-->>Admin: エラー（権限不足）
    else ユーザーが存在しないまたは無効
        S-->>Admin: エラー（ユーザー不存在/無効）
    else ターゲットが存在しない
        S-->>Admin: エラー（ターゲット不存在）
    else 割当が重複
        S-->>Admin: エラー（重複割当）
    else 正常
        S->>S: ロール割当を作成
        S->>EV: ドメインイベント「ロール割当作成」を発行
        S-->>Admin: 割当完了
    end
    deactivate S
```

### BUC-023: ロール割当を取り消す

```mermaid
sequenceDiagram
    actor Admin as 管理者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: ロール割当取消要求<br/>（ユーザーID・ターゲット種別・ターゲットID・ロール名）
    activate S
    S->>S: 操作者の権限を確認
    S->>S: ロール割当の存在を確認
    alt 権限不足
        S-->>Admin: エラー（権限不足）
    else 割当が存在しない
        S-->>Admin: エラー（割当不存在）
    else 正常
        S->>S: ロール割当を削除
        S->>EV: ドメインイベント「ロール割当削除」を発行
        S-->>Admin: 取消完了
    end
    deactivate S
```

## スコープ外（外部システムの責務）

| 責務 | 説明 | 想定される外部システム |
|------|------|----------------------|
| ロール定義 | ロール名に紐づくパーミッションの定義・管理 | SpiceDB, OPA, Cedar等 |
| パーミッション定義 | resource:action形式のアクセス権の定義 | SpiceDB, OPA, Cedar等 |
| アクセス制御評価 | 「ユーザーXはリソースYに対してアクションZを実行できるか」の判定 | SpiceDB, OPA, Cedar等 |

akashic-tsは「ユーザーXはOU/グループYに対してロール名Zを持つ」という割当データのみを管理し、ドメインイベントとして配信する。外部システムはこの割当情報を受け取り、独自のポリシーに基づいてアクセス制御を行う。

## 条件一覧

| ID | 条件 | 関連UC |
|----|------|--------|
| COND-019 | 同一ユーザー・同一ターゲット・同一ロール名の重複割当禁止 | UC-039, UC-040 |
| COND-020 | ロール名は外部定義（akashic-tsは管理しない） | - |
| COND-021 | 割当対象はOUまたはグループ（組織全体はルートOUで代替） | UC-039, UC-040 |
| COND-022 | 割当時にユーザー・OU/グループの存在と有効性を確認 | UC-039, UC-040 |
