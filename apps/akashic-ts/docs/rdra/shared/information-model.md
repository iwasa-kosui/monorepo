---
type: rdra-shared
kind: information-model

entities:
  - id: "INFO-001"
    name: "組織"
    description: "顧客企業の契約・管理単位。基盤全体で一意の組織コードを持つ"
    traces_to: ["GOAL-001"]
    attributes:
      - name: "organizationId"
        type: "OrganizationId (UUID)"
        constraints: "PK"
      - name: "organizationName"
        type: "string"
        constraints: "NOT NULL, 1〜200文字"
      - name: "organizationCode"
        type: "string"
        constraints: "NOT NULL, UNIQUE（基盤全体）"
      - name: "status"
        type: "OrganizationStatus"
        constraints: "NOT NULL → STATE-001"
      - name: "disabledAt"
        type: "Instant?"
        constraints: "無効化日時（猶予期間の起算点）"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"
      - name: "updatedAt"
        type: "Instant"
        constraints: "NOT NULL"

  - id: "INFO-002"
    name: "組織単位（OU）"
    description: "組織内のツリー構造ノード。親OUへの参照で階層を形成する。組織作成時にルートOUが自動生成される"
    traces_to: ["GOAL-001"]
    attributes:
      - name: "ouId"
        type: "OuId (UUID)"
        constraints: "PK"
      - name: "organizationId"
        type: "OrganizationId"
        constraints: "NOT NULL, FK → INFO-001"
      - name: "parentOuId"
        type: "OuId?"
        constraints: "FK → INFO-002（ルートOUの場合はNULL）"
      - name: "displayName"
        type: "string"
        constraints: "NOT NULL, 1〜200文字"
      - name: "ouCode"
        type: "string"
        constraints: "NOT NULL, UNIQUE（組織内）"
      - name: "metadata"
        type: "Record<string, string>"
        constraints: "key-valueペア"
      - name: "isRoot"
        type: "boolean"
        constraints: "NOT NULL（ルートOUは削除不可）"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"
      - name: "updatedAt"
        type: "Instant"
        constraints: "NOT NULL"

  - id: "INFO-003"
    name: "グループ"
    description: "組織単位の順序付き集合。用途はOSS利用者が自由に定義する"
    traces_to: ["GOAL-001"]
    attributes:
      - name: "groupId"
        type: "GroupId (UUID)"
        constraints: "PK"
      - name: "organizationId"
        type: "OrganizationId"
        constraints: "NOT NULL, FK → INFO-001"
      - name: "groupName"
        type: "string"
        constraints: "NOT NULL, 1〜200文字"
      - name: "groupCode"
        type: "string"
        constraints: "NOT NULL, UNIQUE（組織内）"
      - name: "metadata"
        type: "Record<string, string>"
        constraints: "key-valueペア"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"
      - name: "updatedAt"
        type: "Instant"
        constraints: "NOT NULL"

  - id: "INFO-004"
    name: "ユーザー"
    description: "組織に属する人。1組織のみに所属し、OUまたはグループに対してロールを持つ"
    traces_to: ["GOAL-002"]
    attributes:
      - name: "userId"
        type: "UserId (UUID)"
        constraints: "PK（基盤内部ID）"
      - name: "organizationId"
        type: "OrganizationId"
        constraints: "NOT NULL, FK → INFO-001"
      - name: "displayName"
        type: "string"
        constraints: "NOT NULL, 1〜200文字"
      - name: "username"
        type: "string?"
        constraints: "UNIQUE（組織内）。メールアドレスが未設定の場合は必須"
      - name: "email"
        type: "string?"
        constraints: "ユーザー名が未設定の場合は必須"
      - name: "status"
        type: "UserStatus"
        constraints: "NOT NULL → STATE-002"
      - name: "disabledAt"
        type: "Instant?"
        constraints: "無効化日時（猶予期間の起算点）"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"
      - name: "updatedAt"
        type: "Instant"
        constraints: "NOT NULL"

  - id: "INFO-005"
    name: "ロール割当"
    description: "ユーザーがOU/グループに対して持つロール名の割当。ロール定義・パーミッション・アクセス制御評価は外部に委ねる"
    traces_to: ["GOAL-002", "GOAL-005"]
    attributes:
      - name: "roleAssignmentId"
        type: "RoleAssignmentId (UUID)"
        constraints: "PK"
      - name: "userId"
        type: "UserId"
        constraints: "NOT NULL, FK → INFO-004"
      - name: "targetType"
        type: "\"ou\" | \"group\""
        constraints: "NOT NULL"
      - name: "targetId"
        type: "OuId | GroupId"
        constraints: "NOT NULL（targetTypeに応じてINFO-002またはINFO-003を参照）"
      - name: "roleName"
        type: "string"
        constraints: "NOT NULL（外部定義のロール名。任意の文字列）"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"
    unique_constraints:
      - columns: ["userId", "targetType", "targetId", "roleName"]
        description: "同一ユーザー・同一ターゲット・同一ロール名の重複割当禁止"

  - id: "INFO-006"
    name: "イベントサブスクリプション"
    description: "イベント配信の購読設定。配信アダプターを通じてプロダクト提供者にイベントをPush配信する"
    traces_to: ["GOAL-004"]
    attributes:
      - name: "subscriptionId"
        type: "SubscriptionId (UUID)"
        constraints: "PK"
      - name: "subscriptionName"
        type: "string"
        constraints: "NOT NULL, UNIQUE（基盤全体）"
      - name: "destinationConfig"
        type: "DestinationConfig"
        constraints: "NOT NULL（配信先の設定。アダプター固有の情報を含む）"
      - name: "eventPattern"
        type: "EventPattern"
        constraints: "NOT NULL（イベントパターン: イベント種別・コンテキスト・組織）"
      - name: "status"
        type: "SubscriptionStatus"
        constraints: "NOT NULL（active / inactive）"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"
      - name: "updatedAt"
        type: "Instant"
        constraints: "NOT NULL"

  - id: "INFO-007"
    name: "招待"
    description: "ユーザーを組織に招待する際のエンティティ。招待トークンを持ち、有効期限・承諾・取消のライフサイクルを管理する"
    traces_to: ["GOAL-002"]
    attributes:
      - name: "invitationId"
        type: "InvitationId (UUID)"
        constraints: "PK"
      - name: "organizationId"
        type: "OrganizationId"
        constraints: "NOT NULL, FK → INFO-001"
      - name: "email"
        type: "string"
        constraints: "NOT NULL（招待先メールアドレス）"
      - name: "invitationToken"
        type: "string"
        constraints: "NOT NULL, UNIQUE（招待承諾用トークン）"
      - name: "initialRoleAssignments"
        type: "InitialRoleAssignment[]"
        constraints: "招待承諾時に適用されるロール割当の一覧"
      - name: "status"
        type: "InvitationStatus"
        constraints: "NOT NULL → STATE-003"
      - name: "invitedByUserId"
        type: "UserId"
        constraints: "NOT NULL, FK → INFO-004（招待した管理者）"
      - name: "expiresAt"
        type: "Instant"
        constraints: "NOT NULL（招待の有効期限）"
      - name: "acceptedAt"
        type: "Instant?"
        constraints: "承諾日時"
      - name: "cancelledAt"
        type: "Instant?"
        constraints: "取消日時"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"

  - id: "INFO-008"
    name: "グループOU構成"
    description: "グループとOUの中間エンティティ。グループ内でのOUの順序を管理する。1つのOUは複数グループに所属可能だが、同一グループ内での重複は不可"
    traces_to: ["GOAL-001"]
    attributes:
      - name: "groupId"
        type: "GroupId"
        constraints: "NOT NULL, FK → INFO-003, 複合PKの一部"
      - name: "ouId"
        type: "OuId"
        constraints: "NOT NULL, FK → INFO-002, 複合PKの一部"
      - name: "sortOrder"
        type: "number"
        constraints: "NOT NULL（グループ内での順序）"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"
    unique_constraints:
      - columns: ["groupId", "ouId"]
        description: "同一グループ内でのOU重複禁止"

  - id: "INFO-009"
    name: "ドメインイベント"
    description: "システム内の全ての状態変化を記録する横断的エンティティ。監査証跡およびイベントストリームの基盤となる"
    traces_to: ["GOAL-003", "GOAL-004"]
    attributes:
      - name: "eventId"
        type: "EventId (UUID)"
        constraints: "PK（冪等性の保証に使用）"
      - name: "aggregateKind"
        type: "string"
        constraints: "NOT NULL（集約の種別: Organization, Ou, Group, User, RoleAssignment, Invitation, EventConsumer）"
      - name: "aggregateId"
        type: "string (UUID)"
        constraints: "NOT NULL（変更対象の集約ID）"
      - name: "organizationId"
        type: "OrganizationId?"
        constraints: "FK → INFO-001（組織横断イベントの場合はNULL）"
      - name: "eventName"
        type: "string"
        constraints: "NOT NULL（例: organization.created, ou.moved, user.disabled）"
      - name: "eventPayload"
        type: "Record<string, unknown>"
        constraints: "NOT NULL（イベント固有のペイロード）"
      - name: "aggregateState"
        type: "Record<string, unknown>?"
        constraints: "変更後の集約状態（削除イベントの場合はNULL）"
      - name: "actorId"
        type: "string?"
        constraints: "操作者のID（システム自動処理の場合はNULL）"
      - name: "occurredAt"
        type: "Instant"
        constraints: "NOT NULL（イベント発生日時）"
      - name: "aggregateVersion"
        type: "number"
        constraints: "NOT NULL（集約内の単調増加バージョン番号。リオーダリング・欠損検出に使用）"
      - name: "sequenceNumber"
        type: "bigint"
        constraints: "NOT NULL, UNIQUE（ストリーム内のグローバル順序番号。カーソルとして使用）"

  - id: "INFO-010"
    name: "スナップショット"
    description: "エンティティの現在状態をある論理時点で一括キャプチャしたもの。スナップショットアダプターを通じて書き出される"
    traces_to: ["GOAL-004"]
    attributes:
      - name: "snapshotVersion"
        type: "number"
        constraints: "PK（単調増加）"
      - name: "organizationId"
        type: "OrganizationId?"
        constraints: "FK → INFO-001（組織単位パーティショニングの場合。全体スナップショットの場合はNULL）"
      - name: "storageLocation"
        type: "string"
        constraints: "NOT NULL（スナップショットアダプター上のロケーション識別子）"
      - name: "eventSequenceNumber"
        type: "bigint"
        constraints: "NOT NULL（このスナップショット時点のイベントストリーム位置）"
      - name: "entityCounts"
        type: "Record<string, number>"
        constraints: "NOT NULL（エンティティ種別ごとのレコード数）"
      - name: "status"
        type: "SnapshotStatus"
        constraints: "NOT NULL（generating / available / expired）"
      - name: "createdAt"
        type: "Instant"
        constraints: "NOT NULL"
---

# 情報モデル

## ER図

```mermaid
erDiagram
    Organization ||--o{ Ou : "has"
    Organization ||--o{ Group : "has"
    Organization ||--o{ User : "has"
    Organization ||--o{ Invitation : "has"
    Organization ||--o{ DomainEvent : "records"

    Ou ||--o| Ou : "parentOuId"
    Ou ||--o{ GroupOuMembership : "belongs to groups"
    Ou ||--o{ RoleAssignment : "target (targetType=ou)"

    Group ||--o{ GroupOuMembership : "has members"
    Group ||--o{ RoleAssignment : "target (targetType=group)"

    User ||--o{ RoleAssignment : "has"
    User ||--o{ Invitation : "invitedBy"

    Snapshot ||--|| DomainEvent : "eventSequenceNumber"

    Organization {
        OrganizationId organizationId PK
        string organizationName
        string organizationCode UK
        OrganizationStatus status
        Instant disabledAt
        Instant createdAt
        Instant updatedAt
    }

    Ou {
        OuId ouId PK
        OrganizationId organizationId FK
        OuId parentOuId FK
        string displayName
        string ouCode
        JSON metadata
        boolean isRoot
        Instant createdAt
        Instant updatedAt
    }

    Group {
        GroupId groupId PK
        OrganizationId organizationId FK
        string groupName
        string groupCode
        JSON metadata
        Instant createdAt
        Instant updatedAt
    }

    GroupOuMembership {
        GroupId groupId PK
        OuId ouId PK
        number sortOrder
        Instant createdAt
    }

    User {
        UserId userId PK
        OrganizationId organizationId FK
        string displayName
        string username
        string email
        UserStatus status
        Instant disabledAt
        Instant createdAt
        Instant updatedAt
    }

    RoleAssignment {
        RoleAssignmentId roleAssignmentId PK
        UserId userId FK
        string targetType
        string targetId
        string roleName
        Instant createdAt
    }

    Invitation {
        InvitationId invitationId PK
        OrganizationId organizationId FK
        string email
        string invitationToken UK
        JSON initialRoleAssignments
        InvitationStatus status
        UserId invitedByUserId FK
        Instant expiresAt
        Instant acceptedAt
        Instant cancelledAt
        Instant createdAt
    }

    EventSubscription {
        SubscriptionId subscriptionId PK
        string subscriptionName UK
        DestinationConfig destinationConfig
        EventPattern eventPattern
        SubscriptionStatus status
        Instant createdAt
        Instant updatedAt
    }

    DomainEvent {
        EventId eventId PK
        string aggregateKind
        string aggregateId
        OrganizationId organizationId FK
        string eventName
        JSON eventPayload
        JSON aggregateState
        string actorId
        number aggregateVersion
        Instant occurredAt
        bigint sequenceNumber UK
    }

    Snapshot {
        number snapshotVersion PK
        OrganizationId organizationId FK
        string storageLocation
        bigint eventSequenceNumber
        JSON entityCounts
        SnapshotStatus status
        Instant createdAt
    }
```

## 一意性制約まとめ

| エンティティ | 制約 | スコープ |
|------------|------|---------|
| INFO-001 組織 | organizationCode | 基盤全体 |
| INFO-002 OU | ouCode | 組織内 |
| INFO-003 グループ | groupCode | 組織内 |
| INFO-004 ユーザー | username | 組織内（設定時のみ） |
| INFO-005 ロール割当 | (userId, targetType, targetId, roleName) | 基盤全体 |
| INFO-006 サブスクリプション | subscriptionName | 基盤全体 |
| INFO-007 招待 | invitationToken | 基盤全体 |
| INFO-008 グループOU構成 | (groupId, ouId) | 基盤全体 |
| INFO-009 ドメインイベント | eventId, sequenceNumber | 基盤全体 |
| INFO-010 スナップショット | snapshotVersion | 基盤全体 |

## カスケード削除の影響範囲

| 削除対象 | カスケード削除される関連エンティティ | 削除されないもの |
|---------|-----------------------------------|----------------|
| Organization | Ou, Group, GroupOuMembership, User, RoleAssignment, Invitation | - |
| Ou | 配下Ou（再帰）, 関連RoleAssignment(targetType=ou), 関連GroupOuMembership | User |
| Group | 関連RoleAssignment(targetType=group), 関連GroupOuMembership | - |
| User | 関連RoleAssignment | - |
