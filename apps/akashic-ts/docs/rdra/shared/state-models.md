---
type: rdra-shared
kind: state-models

states:
  - id: "STATE-001"
    name: "組織状態"
    entity: "INFO-001"
    description: "組織のライフサイクル状態。有効→無効→削除の段階的デプロビジョニングを管理する"
    traces_to: ["GOAL-001"]
    values:
      - name: "active"
        display_name: "有効"
        description: "正常に利用可能な状態。設定変更・配下操作が可能"
      - name: "disabled"
        display_name: "無効"
        description: "無効化された状態。配下ユーザーのアクセスが停止される。設定変更不可。猶予期間内は復元可能"
      - name: "deleted"
        display_name: "削除済み"
        description: "削除された状態。配下の全データがカスケード削除される。復元不可"
    transitions:
      - from: "(initial)"
        to: "active"
        trigger: "UC-001 組織作成"
        event: "EVT-001"
      - from: "active"
        to: "disabled"
        trigger: "UC-004 組織無効化"
        event: "EVT-004"
        conditions: ["COND-002"]
      - from: "disabled"
        to: "active"
        trigger: "UC-005 組織復元"
        event: "EVT-005"
        conditions: ["COND-003"]
      - from: "disabled"
        to: "deleted"
        trigger: "猶予期間経過後の自動削除"
        event: "EVT-006"
      - from: "active"
        to: "deleted"
        trigger: "UC-006 基盤提供者による即時削除"
        event: "EVT-006"
        conditions: ["COND-004"]
      - from: "disabled"
        to: "deleted"
        trigger: "UC-006 基盤提供者による即時削除"
        event: "EVT-006"
        conditions: ["COND-004"]

  - id: "STATE-002"
    name: "ユーザー状態"
    entity: "INFO-004"
    description: "ユーザーのライフサイクル状態。有効→無効→削除の段階的な管理を行う"
    traces_to: ["GOAL-002"]
    values:
      - name: "active"
        display_name: "有効"
        description: "正常に利用可能な状態。システムにアクセス可能"
      - name: "disabled"
        display_name: "無効"
        description: "無効化された状態。システムにアクセス不可。猶予期間内は復元可能"
      - name: "deleted"
        display_name: "削除済み"
        description: "削除された状態。ロール割当もカスケード削除される。復元不可"
    transitions:
      - from: "(initial)"
        to: "active"
        trigger: "UC-028 ユーザー直接作成 / UC-029 招待承諾"
        event: "EVT-022 / EVT-023"
      - from: "active"
        to: "disabled"
        trigger: "UC-034 ユーザー無効化"
        event: "EVT-028"
        conditions: ["COND-017"]
      - from: "disabled"
        to: "active"
        trigger: "UC-035 ユーザー復元"
        event: "EVT-029"
      - from: "disabled"
        to: "deleted"
        trigger: "猶予期間経過後の自動削除"
        event: "EVT-030"
        conditions: ["COND-018"]
      - from: "active"
        to: "deleted"
        trigger: "UC-036 即時削除"
        event: "EVT-030"
        conditions: ["COND-018"]
      - from: "disabled"
        to: "deleted"
        trigger: "UC-036 即時削除"
        event: "EVT-030"
        conditions: ["COND-018"]

  - id: "STATE-003"
    name: "招待状態"
    entity: "INFO-007"
    description: "招待のライフサイクル状態。保留中から承諾・取消・期限切れのいずれかに遷移する"
    traces_to: ["GOAL-002"]
    values:
      - name: "pending"
        display_name: "保留中"
        description: "招待が送信され、承諾を待っている状態"
      - name: "accepted"
        display_name: "承諾済み"
        description: "招待が承諾され、ユーザーが組織に参加した状態。終端状態"
      - name: "cancelled"
        display_name: "取消済み"
        description: "管理者によって招待が取り消された状態。終端状態"
      - name: "expired"
        display_name: "期限切れ"
        description: "有効期限が経過した状態。終端状態"
    transitions:
      - from: "(initial)"
        to: "pending"
        trigger: "UC-027 ユーザー招待"
        event: "EVT-021"
      - from: "pending"
        to: "accepted"
        trigger: "UC-029 招待承諾"
        event: "EVT-023"
      - from: "pending"
        to: "cancelled"
        trigger: "UC-030 招待取消"
        event: "EVT-024"
      - from: "pending"
        to: "expired"
        trigger: "有効期限経過（システム自動）"
        event: null
---

# 状態モデル

## STATE-001: 組織状態

```mermaid
stateDiagram-v2
    [*] --> active : UC-001 組織作成\n/ EVT-001
    active --> disabled : UC-004 組織無効化\n/ EVT-004
    disabled --> active : UC-005 組織復元\n（猶予期間内のみ）\n/ EVT-005
    disabled --> deleted : 猶予期間経過後の自動削除\n/ EVT-006
    active --> deleted : UC-006 基盤提供者による即時削除\n/ EVT-006
    disabled --> deleted : UC-006 基盤提供者による即時削除\n/ EVT-006
    deleted --> [*]

    state active {
        [*] --> 設定変更可
    }
    state disabled {
        [*] --> 設定変更不可
        設定変更不可 : 配下ユーザーのアクセス停止
    }
    state deleted {
        [*] --> カスケード削除
        カスケード削除 : OU・グループ・ユーザー・ロール割当
    }
```

### 遷移条件

| 遷移 | 条件 |
|------|------|
| active → disabled | - |
| disabled → active | COND-003: 猶予期間内のみ |
| active → deleted | COND-004: 基盤提供者のみ |
| disabled → deleted | COND-004（即時削除時）/ 猶予期間経過（自動削除時） |

## STATE-002: ユーザー状態

```mermaid
stateDiagram-v2
    [*] --> active : UC-028 直接作成 / UC-029 招待承諾\n/ EVT-022, EVT-023
    active --> disabled : UC-034 ユーザー無効化\n/ EVT-028
    disabled --> active : UC-035 ユーザー復元\n（猶予期間内のみ）\n/ EVT-029
    disabled --> deleted : 猶予期間経過後の自動削除\n/ EVT-030
    active --> deleted : UC-036 即時削除\n/ EVT-030
    disabled --> deleted : UC-036 即時削除\n/ EVT-030
    deleted --> [*]

    state active {
        [*] --> アクセス可能
    }
    state disabled {
        [*] --> アクセス不可
        アクセス不可 : COND-017
    }
    state deleted {
        [*] --> ロール割当削除
        ロール割当削除 : COND-018
    }
```

### 遷移条件

| 遷移 | 条件 |
|------|------|
| active → disabled | - |
| disabled → active | 猶予期間内のみ |
| active → deleted | 即時削除権限を持つアクターのみ |
| disabled → deleted | 即時削除権限 / 猶予期間経過 |

## STATE-003: 招待状態

```mermaid
stateDiagram-v2
    [*] --> pending : UC-027 ユーザー招待\n/ EVT-021
    pending --> accepted : UC-029 招待承諾\n/ EVT-023
    pending --> cancelled : UC-030 招待取消\n/ EVT-024
    pending --> expired : 有効期限経過\n（システム自動）
    accepted --> [*]
    cancelled --> [*]
    expired --> [*]

    state pending {
        [*] --> 承諾待ち
        承諾待ち : 招待メール送信済み
    }
    state accepted {
        [*] --> ユーザー作成済み
        ユーザー作成済み : 初期ロール割当適用
    }
```

### 遷移条件

| 遷移 | 条件 |
|------|------|
| pending → accepted | 有効なトークン・期限内 |
| pending → cancelled | 管理者操作 |
| pending → expired | expiresAt経過（システム自動） |
