---
type: rdra-context
id: "BIZ-004"
name: "user-lifecycle"
display_name: "ユーザーライフサイクル"

# システム価値レイヤー
value:
  goals: ["GOAL-002"]
  requirements:
    - id: "REQ-017"
      description: "メールアドレスによる招待でユーザーを組織に追加できる"
      traces_to: ["GOAL-002"]
    - id: "REQ-018"
      description: "管理者がユーザーを直接作成できる（招待なし）"
      traces_to: ["GOAL-002"]
    - id: "REQ-019"
      description: "招待を承諾してユーザーが参加できる"
      traces_to: ["GOAL-002"]
    - id: "REQ-020"
      description: "ユーザーのプロフィールを変更できる（表示名・ユーザー名・メールアドレス。ユーザー名またはメールアドレスのいずれかは必須）"
      traces_to: ["GOAL-002"]
    - id: "REQ-021"
      description: "ユーザーを無効化・復元できる（無効化でアクセス停止、復元で復旧）"
      traces_to: ["GOAL-002"]
    - id: "REQ-022"
      description: "ユーザーを削除できる（無効化→猶予→削除、または即時削除）"
      traces_to: ["GOAL-002"]
    - id: "REQ-023"
      description: "ユーザーの一覧・詳細を参照できる"
      traces_to: ["GOAL-002"]

# 外部環境レイヤー
environment:
  business_usecases:
    - id: "BUC-015"
      name: "ユーザーを招待する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
      description: "メールアドレスを指定してユーザーを組織に招待する。初期ロール割当も指定可能"
      traces_to: ["REQ-017"]
    - id: "BUC-016"
      name: "ユーザーを直接作成する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-008"]
      description: "管理者が招待なしでユーザーを直接作成する。表示名・ユーザー名・メールアドレスを入力（ユーザー名またはメールアドレスのいずれかは必須）"
      traces_to: ["REQ-018"]
    - id: "BUC-017"
      name: "招待を承諾する"
      actors: ["ACTOR-001"]
      description: "招待されたユーザーが招待を承諾し、組織に参加する"
      traces_to: ["REQ-019"]
    - id: "BUC-018"
      name: "ユーザーのプロフィールを変更する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003"]
      description: "ユーザー自身または管理者がプロフィール（表示名・ユーザー名・メールアドレス）を変更する"
      traces_to: ["REQ-020"]
    - id: "BUC-019"
      name: "ユーザーを無効化・復元する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006", "ACTOR-009"]
      description: "ユーザーを無効化してアクセスを停止する。猶予期間中は復元可能"
      traces_to: ["REQ-021"]
    - id: "BUC-020"
      name: "ユーザーを削除する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006"]
      description: "猶予期間経過後に自動削除、または権限を持つアクターが即時削除する。ロール割当も削除される"
      traces_to: ["REQ-022"]
    - id: "BUC-021"
      name: "ユーザーを参照する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
      description: "組織内ユーザーの一覧検索・詳細参照を行う"
      traces_to: ["REQ-023"]

# システム境界レイヤー
boundary:
  usecases:
    - id: "UC-027"
      name: "ユーザーを招待する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
      screens: ["SCR-007"]
      events: ["EVT-021"]
      traces_to: ["BUC-015"]
      description: "メールアドレス・初期ロール割当を受け取り、招待を作成する。招待メールの送信は外部連携"
    - id: "UC-028"
      name: "ユーザーを直接作成する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-008"]
      screens: ["SCR-007"]
      events: ["EVT-022"]
      traces_to: ["BUC-016"]
      description: "表示名・ユーザー名・メールアドレス・初期ロール割当を受け取り、ユーザーを作成する。ユーザー名またはメールアドレスのいずれかは必須。基盤内部IDを発行"
    - id: "UC-029"
      name: "招待を承諾する"
      actors: ["ACTOR-001"]
      screens: []
      events: ["EVT-023"]
      traces_to: ["BUC-017"]
      description: "招待トークンを検証し、ユーザーを作成して組織に参加させる。基盤内部IDを発行"
    - id: "UC-030"
      name: "招待を取り消す"
      actors: ["ACTOR-002", "ACTOR-003"]
      screens: ["SCR-007"]
      events: ["EVT-024"]
      traces_to: ["BUC-015"]
      description: "未承諾の招待を取り消す"
    - id: "UC-031"
      name: "ユーザーの表示名を変更する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003"]
      screens: ["SCR-008"]
      events: ["EVT-025"]
      traces_to: ["BUC-018"]
      description: "ユーザーの表示名を変更する"
    - id: "UC-032"
      name: "ユーザーのユーザー名を変更する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003"]
      screens: ["SCR-008"]
      events: ["EVT-026"]
      traces_to: ["BUC-018"]
      description: "ユーザーのユーザー名を変更する。組織内での一意性を検証する"
    - id: "UC-033"
      name: "ユーザーのメールアドレスを変更する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003"]
      screens: ["SCR-008"]
      events: ["EVT-027"]
      traces_to: ["BUC-018"]
      description: "ユーザーのメールアドレスを変更する。ユーザー名が未設定の場合はメールアドレスを空にできない"
    - id: "UC-034"
      name: "ユーザーを無効化する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006", "ACTOR-009"]
      screens: ["SCR-008"]
      events: ["EVT-028"]
      traces_to: ["BUC-019"]
      description: "ユーザーを無効化してアクセスを停止する"
    - id: "UC-035"
      name: "ユーザーを復元する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006", "ACTOR-009"]
      screens: ["SCR-008"]
      events: ["EVT-029"]
      traces_to: ["BUC-019"]
      description: "猶予期間中の無効化されたユーザーを復元する"
    - id: "UC-036"
      name: "ユーザーを削除する"
      actors: ["ACTOR-002", "ACTOR-003", "ACTOR-006"]
      screens: ["SCR-008"]
      events: ["EVT-030"]
      traces_to: ["BUC-020"]
      description: "ユーザーを削除する。即時削除または猶予期間経過後の自動削除。ロール割当も削除される"
    - id: "UC-037"
      name: "ユーザー一覧を取得する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
      screens: ["SCR-007"]
      events: []
      traces_to: ["BUC-021"]
      description: "組織内のユーザー一覧を取得する。OU・ロール・状態でフィルタ可能。ページネーション付き"
    - id: "UC-038"
      name: "ユーザー詳細を取得する"
      actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
      screens: ["SCR-008"]
      events: []
      traces_to: ["BUC-021"]
      description: "特定のユーザーのプロフィール・ロール割当一覧・状態を取得する"
  screens:
    - id: "SCR-007"
      name: "ユーザー一覧画面"
      description: "基盤提供者向け管理画面。ユーザーの検索・一覧表示・招待・直接作成への導線を提供"
      information: ["INFO-004"]
    - id: "SCR-008"
      name: "ユーザー詳細・編集画面"
      description: "基盤提供者向け管理画面。ユーザーの詳細表示・プロフィール変更・無効化/復元/削除の操作を提供"
      information: ["INFO-004"]
  events:
    - id: "EVT-021"
      name: "ユーザー招待イベント"
      trigger: "UC-027 招待作成完了時"
      description: "ユーザー招待が作成されたことを表すドメインイベント"
    - id: "EVT-022"
      name: "ユーザー作成イベント"
      trigger: "UC-028 ユーザー直接作成完了時"
      description: "ユーザーが直接作成されたことを表すドメインイベント"
    - id: "EVT-023"
      name: "招待承諾イベント"
      trigger: "UC-029 招待承諾完了時"
      description: "ユーザーが招待を承諾して組織に参加したことを表すドメインイベント"
    - id: "EVT-024"
      name: "招待取消イベント"
      trigger: "UC-030 招待取消完了時"
      description: "招待が取り消されたことを表すドメインイベント"
    - id: "EVT-025"
      name: "ユーザー表示名変更イベント"
      trigger: "UC-031 表示名変更完了時"
      description: "ユーザーの表示名が変更されたことを表すドメインイベント"
    - id: "EVT-026"
      name: "ユーザー名変更イベント"
      trigger: "UC-032 ユーザー名変更完了時"
      description: "ユーザーのユーザー名が変更されたことを表すドメインイベント"
    - id: "EVT-027"
      name: "ユーザーメールアドレス変更イベント"
      trigger: "UC-033 メールアドレス変更完了時"
      description: "ユーザーのメールアドレスが変更されたことを表すドメインイベント"
    - id: "EVT-028"
      name: "ユーザー無効化イベント"
      trigger: "UC-034 無効化完了時"
      description: "ユーザーが無効化されたことを表すドメインイベント"
    - id: "EVT-029"
      name: "ユーザー復元イベント"
      trigger: "UC-035 復元完了時"
      description: "ユーザーが復元されたことを表すドメインイベント"
    - id: "EVT-030"
      name: "ユーザー削除イベント"
      trigger: "UC-036 削除完了時"
      description: "ユーザーが削除されたことを表すドメインイベント"

# システムレイヤー
system:
  information: ["INFO-004", "INFO-005", "INFO-007"]
  states: ["STATE-002", "STATE-003"]
  conditions:
    - id: "COND-013"
      name: "ユーザーは1組織のみ所属"
      description: "ユーザーは1つの組織にのみ所属できる"
      traces_to: ["UC-027", "UC-028", "UC-029"]
    - id: "COND-014"
      name: "認証は外部IdPに委譲"
      description: "akashic-tsはユーザー管理と認可のみを担当し、認証（ログイン）は外部IdPに委譲する"
      traces_to: []
    - id: "COND-015"
      name: "ユーザー名またはメールアドレスのいずれかは必須"
      description: "ユーザーはユーザー名またはメールアドレスのいずれか一方は必ず持つ"
      traces_to: ["UC-028", "UC-032", "UC-033"]
    - id: "COND-016"
      name: "ユーザー名は組織内で一意"
      description: "ユーザー名が設定されている場合、同一組織内で一意でなければならない"
      traces_to: ["UC-028", "UC-032"]
    - id: "COND-017"
      name: "無効化中のユーザーはアクセス不可"
      description: "無効化されたユーザーはシステムにアクセスできない"
      traces_to: ["UC-034"]
    - id: "COND-018"
      name: "削除時ロール割当も削除"
      description: "ユーザー削除時、そのユーザーのロール割当も削除される"
      traces_to: ["UC-036"]
  variations: []
---

# BIZ-004: ユーザーライフサイクル

## ビジネスコンテキスト図

```mermaid
graph LR
    user["ACTOR-001: ユーザー"]
    orgAdmin["ACTOR-002: 組織管理者"]
    ouAdmin["ACTOR-003: 組織単位管理者"]
    platform["ACTOR-006: 基盤提供者"]
    sales["ACTOR-007: セールス部門"]
    salesops["ACTOR-008: セールスオペレーション部門"]
    cs["ACTOR-009: カスタマーサクセス部門"]

    subgraph ctx["BIZ-004: ユーザーライフサイクル"]
        buc15["BUC-015: ユーザーを\n招待する"]
        buc16["BUC-016: ユーザーを\n直接作成する"]
        buc17["BUC-017: 招待を\n承諾する"]
        buc18["BUC-018: プロフィールを\n変更する"]
        buc19["BUC-019: ユーザーを\n無効化・復元する"]
        buc20["BUC-020: ユーザーを\n削除する"]
        buc21["BUC-021: ユーザーを\n参照する"]
    end

    user --> buc17
    user --> buc18
    user --> buc21
    orgAdmin --> buc15
    orgAdmin --> buc16
    orgAdmin --> buc18
    orgAdmin --> buc19
    orgAdmin --> buc20
    orgAdmin --> buc21
    ouAdmin --> buc15
    ouAdmin --> buc16
    ouAdmin --> buc18
    ouAdmin --> buc19
    ouAdmin --> buc20
    ouAdmin --> buc21
    platform --> buc19
    platform --> buc20
    sales --> buc15
    sales --> buc21
    salesops --> buc15
    salesops --> buc16
    salesops --> buc21
    cs --> buc15
    cs --> buc19
    cs --> buc21
```

## 業務フロー

### BUC-015: ユーザーを招待する

```mermaid
sequenceDiagram
    actor Admin as 管理者
    participant S as akashic-ts
    participant EXT as 外部メール配信
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: ユーザー招待要求<br/>（メールアドレス・初期ロール割当）
    activate S
    S->>S: メールアドレスが既に組織内に存在しないか確認
    S->>S: 操作者の権限を確認
    alt メールアドレスが既存
        S-->>Admin: エラー（既存ユーザー）
    else 権限不足
        S-->>Admin: エラー（権限不足）
    else 正常
        S->>S: 招待を作成（状態: 保留中）
        S->>EXT: 招待メール送信をトリガー
        S->>EV: ドメインイベント「ユーザー招待」を発行
        S-->>Admin: 招待完了
    end
    deactivate S
```

### BUC-016: ユーザーを直接作成する

```mermaid
sequenceDiagram
    actor Admin as 管理者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Admin->>S: ユーザー直接作成要求<br/>（表示名・ユーザー名・メールアドレス・初期ロール割当）
    activate S
    S->>S: 操作者の権限を確認
    S->>S: 基盤内部IDを発行
    alt 権限不足
        S-->>Admin: エラー（権限不足）
    else 正常
        S->>S: ユーザーを作成（状態: 有効）
        S->>EV: ドメインイベント「ユーザー作成」を発行
        S-->>Admin: 作成完了（内部IDを返却）
    end
    deactivate S
```

### BUC-017: 招待を承諾する

```mermaid
sequenceDiagram
    actor User as 招待されたユーザー
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    User->>S: 招待承諾要求（招待トークン）
    activate S
    S->>S: 招待トークンの有効性を検証
    alt トークンが無効または期限切れ
        S-->>User: エラー（無効な招待）
    else トークンが取り消し済み
        S-->>User: エラー（取り消し済み）
    else 正常
        S->>S: 基盤内部IDを発行
        S->>S: ユーザーを作成（状態: 有効）
        S->>S: 招待の状態を「承諾済み」に変更
        S->>S: 初期ロール割当を適用
        S->>EV: ドメインイベント「招待承諾」を発行
        S-->>User: 参加完了
    end
    deactivate S
```

### BUC-019: ユーザーを無効化・復元する

```mermaid
sequenceDiagram
    actor Admin as 管理者 / 基盤提供者
    participant S as akashic-ts
    participant EV as イベント配信<br/>（BIZ-006）

    Note over Admin,EV: === 無効化 ===
    Admin->>S: ユーザー無効化要求
    activate S
    S->>S: 操作者の権限を確認
    S->>S: ユーザーの状態を「無効」に変更
    S->>S: アクセスを停止
    S->>EV: ドメインイベント「ユーザー無効化」を発行
    S-->>Admin: 無効化完了
    deactivate S

    Note over Admin,EV: === 復元 ===
    Admin->>S: ユーザー復元要求
    activate S
    alt 猶予期間内
        S->>S: ユーザーの状態を「有効」に戻す
        S->>S: アクセスを復旧
        S->>EV: ドメインイベント「ユーザー復元」を発行
        S-->>Admin: 復元完了
    else 猶予期間超過
        S-->>Admin: エラー（猶予期間超過）
    end
    deactivate S
```

### BUC-020: ユーザーを削除する

```mermaid
sequenceDiagram
    actor Admin as 管理者 / 基盤提供者
    participant S as akashic-ts
    participant AUTH as ロール割当管理<br/>（BIZ-005）
    participant EV as イベント配信<br/>（BIZ-006）

    alt 猶予期間経過後の自動削除
        S->>AUTH: ユーザーのロール割当を削除
        S->>S: ユーザーを削除
        S->>EV: ドメインイベント「ユーザー削除」を発行
    else 即時削除
        Admin->>S: ユーザー即時削除要求
        activate S
        S->>S: 操作者の権限を確認
        S->>AUTH: ユーザーのロール割当を削除
        S->>S: ユーザーを削除
        S->>EV: ドメインイベント「ユーザー削除」を発行
        S-->>Admin: 削除完了
        deactivate S
    end
```

## 条件一覧

| ID | 条件 | 関連UC |
|----|------|--------|
| COND-013 | ユーザーは1組織のみ所属 | UC-027, UC-028, UC-029 |
| COND-014 | 認証は外部IdPに委譲 | - |
| COND-015 | ユーザー名またはメールアドレスのいずれかは必須 | UC-028, UC-032, UC-033 |
| COND-016 | ユーザー名は組織内で一意 | UC-028, UC-032 |
| COND-017 | 無効化中のユーザーはアクセス不可 | UC-034 |
| COND-018 | 削除時ロール割当も削除 | UC-036 |
