---
type: rdra-context
id: "BIZ-001"
name: "organization-management"
display_name: "組織管理"

# システム価値レイヤー
value:
  goals: ["GOAL-001"]
  requirements:
    - id: "REQ-001"
      description: "組織を作成できる（組織名・組織コード・初期管理者メールアドレス）"
      traces_to: ["GOAL-001"]
    - id: "REQ-002"
      description: "組織の設定を変更できる（組織名・組織コード）。無効化中は変更不可"
      traces_to: ["GOAL-001"]
    - id: "REQ-003"
      description: "組織を無効化・復元・削除できる（無効化→猶予→削除の段階的デプロビジョニング）。基盤提供者のみ即時削除可能"
      traces_to: ["GOAL-001"]
    - id: "REQ-004"
      description: "組織の一覧・詳細を参照できる"
      traces_to: ["GOAL-001"]
    - id: "REQ-005"
      description: "組織コードの一意性が基盤全体で保証される"
      traces_to: ["GOAL-001"]

# 外部環境レイヤー
environment:
  business_usecases:
    - id: "BUC-001"
      name: "新規組織をプロビジョニングする"
      actors: ["ACTOR-006", "ACTOR-007", "ACTOR-008"]
      description: "組織名・組織コード・初期管理者メールアドレスを入力し、新規組織を作成する。初期管理者は自動で招待される"
      traces_to: ["REQ-001", "REQ-005"]
    - id: "BUC-002"
      name: "組織の設定を変更する"
      actors: ["ACTOR-002", "ACTOR-006"]
      description: "有効な組織の組織名・組織コードを変更する。無効化中は変更不可"
      traces_to: ["REQ-002", "REQ-005"]
    - id: "BUC-003"
      name: "組織をデプロビジョニングする"
      actors: ["ACTOR-006", "ACTOR-009"]
      description: "組織を無効化→猶予期間→削除の段階でデプロビジョニングする。猶予期間中は復元可能。基盤提供者は即時削除も可能"
      traces_to: ["REQ-003"]
    - id: "BUC-004"
      name: "組織を参照する"
      actors: ["ACTOR-002", "ACTOR-006", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
      description: "組織の一覧検索・詳細参照を行う。アクターの権限に応じて参照範囲が異なる"
      traces_to: ["REQ-004"]

# システム境界レイヤー
boundary:
  usecases:
    - id: "UC-001"
      name: "組織を作成する"
      actors: ["ACTOR-006", "ACTOR-007", "ACTOR-008"]
      screens: ["SCR-001"]
      events: ["EVT-001"]
      traces_to: ["BUC-001"]
      description: "組織名・組織コード・初期管理者メールアドレスを受け取り、組織を作成する。コードの一意性を検証し、初期管理者の招待をトリガーする"
    - id: "UC-002"
      name: "組織名を変更する"
      actors: ["ACTOR-002", "ACTOR-006"]
      screens: ["SCR-002"]
      events: ["EVT-002"]
      traces_to: ["BUC-002"]
      description: "有効な組織の組織名を変更する。無効化中はエラー"
    - id: "UC-003"
      name: "組織コードを変更する"
      actors: ["ACTOR-002", "ACTOR-006"]
      screens: ["SCR-002"]
      events: ["EVT-003"]
      traces_to: ["BUC-002"]
      description: "有効な組織の組織コードを変更する。一意性を検証し、無効化中はエラー"
    - id: "UC-004"
      name: "組織を無効化する"
      actors: ["ACTOR-006", "ACTOR-009"]
      screens: ["SCR-002"]
      events: ["EVT-004"]
      traces_to: ["BUC-003"]
      description: "有効な組織を無効化する。配下ユーザーのアクセスを停止する"
    - id: "UC-005"
      name: "組織を復元する"
      actors: ["ACTOR-006", "ACTOR-009"]
      screens: ["SCR-002"]
      events: ["EVT-005"]
      traces_to: ["BUC-003"]
      description: "猶予期間中の無効化された組織を復元する。配下ユーザーのアクセスを復旧する"
    - id: "UC-006"
      name: "組織を削除する"
      actors: ["ACTOR-006"]
      screens: ["SCR-002"]
      events: ["EVT-006"]
      traces_to: ["BUC-003"]
      description: "基盤提供者が組織を即時削除する。配下の全データ（OU・グループ・ユーザー・ロール割当）をカスケード削除する"
    - id: "UC-007"
      name: "組織一覧を取得する"
      actors: ["ACTOR-002", "ACTOR-006", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
      screens: ["SCR-001"]
      events: []
      traces_to: ["BUC-004"]
      description: "検索条件（組織名・コード・状態）に基づき組織一覧を返却する。ページネーション付き"
    - id: "UC-008"
      name: "組織詳細を取得する"
      actors: ["ACTOR-002", "ACTOR-006", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
      screens: ["SCR-002"]
      events: []
      traces_to: ["BUC-004"]
      description: "特定の組織の基本情報・状態・メタデータ・配下サマリを返却する"
  screens:
    - id: "SCR-001"
      name: "組織一覧画面"
      description: "基盤提供者向け管理画面。組織の検索・一覧表示・新規作成への導線を提供"
      information: ["INFO-001"]
    - id: "SCR-002"
      name: "組織詳細・編集画面"
      description: "基盤提供者向け管理画面。組織の詳細表示・設定変更・無効化/復元/削除の操作を提供"
      information: ["INFO-001"]
  events:
    - id: "EVT-001"
      name: "組織作成イベント"
      trigger: "UC-001 組織作成完了時"
      description: "組織が作成されたことを表すドメインイベント。組織の全属性を含む"
    - id: "EVT-002"
      name: "組織名変更イベント"
      trigger: "UC-002 組織名変更完了時"
      description: "組織名が変更されたことを表すドメインイベント。変更前後の値を含む"
    - id: "EVT-003"
      name: "組織コード変更イベント"
      trigger: "UC-003 組織コード変更完了時"
      description: "組織コードが変更されたことを表すドメインイベント。変更前後の値を含む"
    - id: "EVT-004"
      name: "組織無効化イベント"
      trigger: "UC-004 組織無効化完了時"
      description: "組織が無効化されたことを表すドメインイベント"
    - id: "EVT-005"
      name: "組織復元イベント"
      trigger: "UC-005 組織復元完了時"
      description: "組織が復元されたことを表すドメインイベント"
    - id: "EVT-006"
      name: "組織削除イベント"
      trigger: "UC-006 組織削除完了時 / 猶予期間経過後の自動削除"
      description: "組織が削除されたことを表すドメインイベント。カスケード削除された関連データの情報を含む"

# システムレイヤー
system:
  information: ["INFO-001"]
  states: ["STATE-001"]
  conditions:
    - id: "COND-001"
      name: "組織コード一意性"
      description: "組織コードは基盤全体で一意でなければならない"
      traces_to: ["UC-001", "UC-003"]
    - id: "COND-002"
      name: "有効な組織のみ設定変更可"
      description: "無効化中の組織は設定変更（組織名・組織コード）ができない"
      traces_to: ["UC-002", "UC-003"]
    - id: "COND-003"
      name: "猶予期間内のみ復元可"
      description: "組織の復元は猶予期間内（最長期間は基盤側で固定）のみ可能"
      traces_to: ["UC-005"]
    - id: "COND-004"
      name: "即時削除は基盤提供者のみ"
      description: "有効または無効化中の組織を即時削除できるのは基盤提供者のみ"
      traces_to: ["UC-006"]
    - id: "COND-005"
      name: "ユーザーは1組織のみ所属"
      description: "初期管理者のメールアドレスが既に別組織に所属している場合は組織作成を拒否する"
      traces_to: ["UC-001"]
  variations: []
---

# BIZ-001: 組織管理

## ビジネスコンテキスト図

```mermaid
graph LR
    platform["ACTOR-006: 基盤提供者"]
    sales["ACTOR-007: セールス部門"]
    salesops["ACTOR-008: セールスオペレーション部門"]
    cs["ACTOR-009: カスタマーサクセス部門"]
    orgAdmin["ACTOR-002: 組織管理者"]

    subgraph ctx["BIZ-001: 組織管理"]
        buc1["BUC-001: 新規組織を\nプロビジョニングする"]
        buc2["BUC-002: 組織の設定を\n変更する"]
        buc3["BUC-003: 組織を\nデプロビジョニングする"]
        buc4["BUC-004: 組織を参照する"]
    end

    platform --> buc1
    platform --> buc2
    platform --> buc3
    platform --> buc4
    sales --> buc1
    sales --> buc4
    salesops --> buc1
    salesops --> buc4
    cs --> buc3
    cs --> buc4
    orgAdmin --> buc2
    orgAdmin --> buc4
```

## 業務フロー

### BUC-001: 新規組織をプロビジョニングする

```mermaid
sequenceDiagram
    actor Ops as セールスオペレーション<br/>/ 基盤提供者
    participant S as akashic-ts
    participant UL as ユーザーライフサイクル<br/>（BIZ-004）
    participant EV as イベント配信<br/>（BIZ-006）

    Ops->>S: 組織作成要求<br/>（組織名・組織コード・初期管理者メールアドレス）
    activate S
    S->>S: 組織コードの一意性を検証
    alt 組織コードが重複
        S-->>Ops: エラー（コード重複）
    else 初期管理者が既に別組織に所属
        S-->>Ops: エラー（ユーザー既存）
    else 正常
        S->>S: 組織を作成（状態: 有効）
        S->>UL: 初期管理者をユーザーとして招待
        S->>EV: ドメインイベント「組織作成」を発行
        S-->>Ops: 作成完了
    end
    deactivate S
```

### BUC-002: 組織の設定を変更する

```mermaid
sequenceDiagram
    actor Admin as 組織管理者<br/>/ 基盤提供者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: 設定変更要求<br/>（組織名 or 組織コード）
    activate S
    S->>S: 組織の状態を確認
    alt 組織が無効化中
        S-->>Admin: エラー（無効化中は変更不可）
    else 組織コード変更の場合
        S->>S: 新コードの一意性を検証
        alt コードが重複
            S-->>Admin: エラー（コード重複）
        else 正常
            S->>S: 設定を更新
            S->>EV: ドメインイベント「組織設定変更」を発行
            S-->>Admin: 変更完了
        end
    else 組織名変更の場合
        S->>S: バリデーション（空でない・長さ制限等）
        S->>S: 設定を更新
        S->>EV: ドメインイベント「組織名変更」を発行
        S-->>Admin: 変更完了
    end
    deactivate S
```

### BUC-003: 組織をデプロビジョニングする

```mermaid
sequenceDiagram
    actor CS as カスタマーサクセス<br/>/ 基盤提供者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Note over CS,EV: === 無効化 ===
    CS->>S: 組織の無効化を要求
    activate S
    S->>S: 組織の状態を「無効」に変更
    S->>S: 配下ユーザーのアクセスを停止
    S->>EV: ドメインイベント「組織無効化」を発行
    S-->>CS: 無効化完了
    deactivate S

    Note over CS,EV: === 猶予期間中の復元（任意） ===
    CS->>S: 組織の復元を要求
    activate S
    alt 猶予期間内
        S->>S: 組織の状態を「有効」に戻す
        S->>S: 配下ユーザーのアクセスを復旧
        S->>EV: ドメインイベント「組織復元」を発行
        S-->>CS: 復元完了
    else 猶予期間超過
        S-->>CS: エラー（猶予期間超過）
    end
    deactivate S

    Note over CS,EV: === 削除（猶予期間経過後 or 即時） ===
    alt 猶予期間経過後の自動削除
        S->>S: 配下の全データをカスケード削除<br/>（OU・グループ・ユーザー・ロール割当）
        S->>S: 組織を削除
        S->>EV: ドメインイベント「組織削除」を発行
    else 基盤提供者による即時削除
        CS->>S: 即時削除を要求（基盤提供者のみ）
        activate S
        S->>S: 配下の全データをカスケード削除
        S->>S: 組織を削除
        S->>EV: ドメインイベント「組織削除」を発行
        S-->>CS: 削除完了
        deactivate S
    end
```

### BUC-004: 組織を参照する

```mermaid
sequenceDiagram
    actor User as セールス / CS<br/>/ 基盤提供者 / 組織管理者
    participant S as akashic-ts

    Note over User,S: === 一覧検索 ===
    User->>S: 組織一覧を要求<br/>（検索条件: 組織名・コード・状態）
    activate S
    S->>S: アクターの権限に応じて参照範囲を制限
    S-->>User: 組織一覧（ページネーション付き）
    deactivate S

    Note over User,S: === 詳細参照 ===
    User->>S: 組織詳細を要求
    activate S
    S-->>User: 組織情報<br/>（基本情報・状態・メタデータ・配下サマリ）
    deactivate S
```

## ロバストネス図

### UC-001: 組織を作成する

```mermaid
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    ops["セールスオペレーション\n/ 基盤提供者"]

    subgraph boundarySg["バウンダリ"]
        scr1["SCR-001: 組織一覧画面"]:::boundary
        api1["POST /organizations"]:::boundary
    end

    subgraph controlSg["コントローラ"]
        ctrl1["UC-001: 組織を作成する"]:::control
        validate["コード一意性検証"]:::control
        userCheck["ユーザー所属検証"]:::control
        invite["初期管理者招待\n（→BIZ-004）"]:::control
    end

    subgraph entitySg["エンティティ"]
        org[("INFO-001: 組織")]:::entity
        evt1["EVT-001: 組織作成イベント"]:::entity
    end

    ops --> scr1
    ops --> api1
    scr1 --> ctrl1
    api1 --> ctrl1
    ctrl1 --> validate
    ctrl1 --> userCheck
    validate --> org
    userCheck --> org
    ctrl1 --> org
    ctrl1 --> invite
    ctrl1 --> evt1
```

### UC-004〜006: 組織のライフサイクル操作

```mermaid
flowchart LR
    classDef boundary fill:#fff59d,stroke:#ffa000,stroke-width:2px
    classDef control fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef entity fill:#e6ee9c,stroke:#4caf50,stroke-width:2px

    actor["基盤提供者\n/ カスタマーサクセス"]

    subgraph boundarySg["バウンダリ"]
        scr2["SCR-002: 組織詳細画面"]:::boundary
        api2["PATCH /organizations/:id"]:::boundary
        api3["DELETE /organizations/:id"]:::boundary
    end

    subgraph controlSg["コントローラ"]
        uc4["UC-004: 無効化"]:::control
        uc5["UC-005: 復元"]:::control
        uc6["UC-006: 削除"]:::control
        gracePeriod["猶予期間検証"]:::control
        cascade["カスケード削除"]:::control
    end

    subgraph entitySg["エンティティ"]
        org[("INFO-001: 組織")]:::entity
        state["STATE-001: 組織状態"]:::entity
        evt4["EVT-004: 無効化イベント"]:::entity
        evt5["EVT-005: 復元イベント"]:::entity
        evt6["EVT-006: 削除イベント"]:::entity
    end

    actor --> scr2
    actor --> api2
    actor --> api3
    scr2 --> uc4
    scr2 --> uc5
    scr2 --> uc6
    api2 --> uc4
    api2 --> uc5
    api3 --> uc6
    uc4 --> org
    uc4 --> state
    uc4 --> evt4
    uc5 --> gracePeriod
    uc5 --> org
    uc5 --> state
    uc5 --> evt5
    uc6 --> cascade
    uc6 --> org
    uc6 --> evt6
    cascade --> org
```

## 条件一覧

| ID | 条件 | 関連UC |
|----|------|--------|
| COND-001 | 組織コードは基盤全体で一意 | UC-001, UC-003 |
| COND-002 | 無効化中の組織は設定変更不可 | UC-002, UC-003 |
| COND-003 | 復元は猶予期間内のみ（最長は基盤側固定） | UC-005 |
| COND-004 | 即時削除は基盤提供者のみ | UC-006 |
| COND-005 | ユーザーは1組織のみ所属 | UC-001 |
