---
type: rdra-overview
project: "akashic-ts"
actors:
  - id: "ACTOR-001"
    name: "ユーザー"
    type: human
    description: "SaaS顧客企業のエンドユーザー。組織単位またはグループに対するロールに基づいてプロダクトを利用する"
  - id: "ACTOR-002"
    name: "組織管理者"
    type: human
    description: "組織全体を管理するロールを持つユーザー。組織の設定・組織単位ツリー・グループ・ユーザー・ロール割当を管理する"
  - id: "ACTOR-003"
    name: "組織単位管理者"
    type: human
    description: "特定の組織単位の管理ロールを持つユーザー。担当OU配下の組織単位・ユーザー・ロール割当を管理する"
  - id: "ACTOR-004"
    name: "グループ管理者"
    type: human
    description: "特定のグループの管理ロールを持つユーザー。担当グループのOU構成・ユーザー・ロール割当を管理する"
  - id: "ACTOR-005"
    name: "プロダクト提供者"
    type: system
    description: "基盤上で動作するSaaSプロダクト（複数存在）。ドメインイベントの受信またはデータ一括取得により、組織・組織単位・ユーザー情報を活用する"
  - id: "ACTOR-006"
    name: "基盤提供者"
    type: human
    description: "akashic-ts基盤自体の運営者。組織のプロビジョニング、基盤全体の設定・監視を行う"
  - id: "ACTOR-007"
    name: "セールス部門"
    type: human
    description: "基盤提供者側の営業部門。新規顧客の獲得・契約管理、組織のプロビジョニングやユーザー操作も行う"
  - id: "ACTOR-008"
    name: "セールスオペレーション部門"
    type: human
    description: "基盤提供者側のセールス運用部門。契約手続き・組織初期設定・組織単位構築・ユーザー操作を担当する"
  - id: "ACTOR-009"
    name: "カスタマーサクセス部門"
    type: human
    description: "基盤提供者側のCS部門。既存顧客の活用支援・オンボーディング、組織のデプロビジョニングやユーザー操作も行う"
goals:
  - id: "GOAL-001"
    name: "マルチ組織の階層管理"
    description: "組織ごとに柔軟なツリー構造の組織単位と、組織単位の順序付き集合であるグループを構築・管理できる"
    actors: ["ACTOR-002", "ACTOR-003", "ACTOR-004", "ACTOR-006", "ACTOR-008"]
  - id: "GOAL-002"
    name: "統一的なユーザーライフサイクル管理"
    description: "ユーザーの招待・参加・ロール変更・無効化・削除を一元管理し、組織単位またはグループに対するロール割当をサポートする"
    actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-006"]
  - id: "GOAL-003"
    name: "完全な監査証跡"
    description: "組織・組織単位・グループ・ユーザー・権限に関するあらゆる変更をドメインイベントとして記録し、後から追跡・監査可能にする"
    actors: ["ACTOR-002", "ACTOR-006", "ACTOR-009"]
  - id: "GOAL-004"
    name: "イベント駆動連携"
    description: "ドメインイベントを外部プロダクトに配信し、マルチプロダクトSaaSのリアクティブな連携を実現する。データの一括取得も提供する"
    actors: ["ACTOR-005", "ACTOR-006"]
  - id: "GOAL-005"
    name: "拡張可能なロール割当モデル"
    description: "基盤はユーザーとOU/グループに対するロール割当の管理のみを提供し、ロール定義・パーミッション定義・アクセス制御評価はOSS利用者（外部システム）に委ねる"
    actors: ["ACTOR-001", "ACTOR-002", "ACTOR-005"]
contexts:
  - id: "BIZ-001"
    name: "organization-management"
    description: "組織のプロビジョニング・設定・ライフサイクル管理"
    primary_actors: ["ACTOR-002", "ACTOR-006", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
    goals: ["GOAL-001"]
  - id: "BIZ-002"
    name: "ou-management"
    description: "組織内の組織単位ツリーの管理（作成・移動・削除・階層変更）"
    primary_actors: ["ACTOR-002", "ACTOR-003", "ACTOR-008"]
    goals: ["GOAL-001"]
  - id: "BIZ-003"
    name: "group-management"
    description: "組織単位の順序付き集合であるグループの管理（作成・OU追加/削除/並替・削除）"
    primary_actors: ["ACTOR-002", "ACTOR-004"]
    goals: ["GOAL-001"]
  - id: "BIZ-004"
    name: "user-lifecycle"
    description: "ユーザーの招待・参加・プロフィール管理・無効化・削除のライフサイクル管理"
    primary_actors: ["ACTOR-001", "ACTOR-002", "ACTOR-003", "ACTOR-007", "ACTOR-008", "ACTOR-009"]
    goals: ["GOAL-002"]
  - id: "BIZ-005"
    name: "role-assignment"
    description: "ユーザーのOU/グループに対するロール割当の管理（割当・取消・参照）。ロール定義・パーミッション定義・アクセス制御評価は外部に委ねる"
    primary_actors: ["ACTOR-002", "ACTOR-003", "ACTOR-004", "ACTOR-005"]
    goals: ["GOAL-002", "GOAL-005"]
  - id: "BIZ-006"
    name: "event-streaming"
    description: "ドメインイベントの記録・Push配信・スナップショット提供"
    primary_actors: ["ACTOR-005", "ACTOR-006"]
    goals: ["GOAL-003", "GOAL-004"]
---

# akashic-ts 全体概観

## プロジェクト概要

akashic-tsは、SaaS企業のための顧客の組織・ユーザー管理基盤OSSである。マルチプロダクトSaaSでの利用を想定し、組織・組織単位（ツリー構造）・グループ（OUの順序付き集合）・ユーザーライフサイクル・ロール＋パーミッションを一元管理する。あらゆる変更はドメインイベントとして記録され、外部プロダクトへの配信が可能。

### ドメイン用語

| 用語 | 説明 |
|------|------|
| 組織 | 顧客企業の契約・管理単位 |
| 組織単位（OU） | 組織直下のツリー構造ノード。部門・支社・課など |
| グループ | 組織単位の順序付き集合。汎用的な用途（OSS利用者が自由に定義） |
| ユーザー | 組織に属する人。OUまたはグループに対してロールを持つ |
| ロール割当 | ユーザーがOU/グループに対して持つロール名の割当。ロール名は任意の文字列であり、パーミッション定義やアクセス制御評価は外部システムに委ねる |

### 現在のスコープ

- 組織管理
- 組織単位ツリー管理
- グループ管理
- ユーザーライフサイクル管理
- ロール割当管理（ロール定義・パーミッション定義・アクセス制御は外部）
- ドメインイベントの記録・配信

### 将来のスコープ

- 端末管理
- ライセンス管理

## システムコンテキスト図

```mermaid
graph TB
    user["ACTOR-001: ユーザー"]
    orgAdmin["ACTOR-002: 組織管理者"]
    ouAdmin["ACTOR-003: 組織単位管理者"]
    grpAdmin["ACTOR-004: グループ管理者"]
    product["ACTOR-005: プロダクト提供者\n（複数）"]
    platform["ACTOR-006: 基盤提供者"]
    sales["ACTOR-007: セールス部門"]
    salesops["ACTOR-008: セールスオペレーション部門"]
    cs["ACTOR-009: カスタマーサクセス部門"]

    system["akashic-ts\n組織・ユーザー管理基盤"]

    user -->|認証・権限確認| system
    orgAdmin -->|組織全体の管理| system
    ouAdmin -->|担当OU配下の管理| system
    grpAdmin -->|担当グループの管理| system
    product <-->|イベント受信・スナップショット取得| system
    platform -->|組織管理・基盤設定| system
    sales -->|組織プロビジョニング・ユーザー操作| system
    salesops -->|組織初期設定・OU構築・ユーザー操作| system
    cs -->|顧客支援・組織デプロビジョニング| system
```

## コンテキスト関連図

```mermaid
graph LR
    subgraph biz1["BIZ-001: 組織管理"]
        tm["組織のプロビジョニング\nと設定"]
    end

    subgraph biz2["BIZ-002: 組織単位管理"]
        ou["組織単位ツリーの\n構築と管理"]
    end

    subgraph biz3["BIZ-003: グループ管理"]
        grp["OUの順序付き集合\nの管理"]
    end

    subgraph biz4["BIZ-004: ユーザーライフサイクル"]
        ul["ユーザーの招待から\n削除までの管理"]
    end

    subgraph biz5["BIZ-005: ロール割当管理"]
        auth["ロール割当の\n管理"]
    end

    subgraph biz6["BIZ-006: イベント配信"]
        ev["ドメインイベントの\n記録と配信"]
    end

    biz1 --> biz2
    biz2 --> biz3
    biz2 --> biz4
    biz3 --> biz5
    biz4 --> biz5
    biz1 --> biz6
    biz2 --> biz6
    biz3 --> biz6
    biz4 --> biz6
    biz5 --> biz6
```

## ゴール一覧

| ID | ゴール | 関連アクター |
|----|-------|------------|
| GOAL-001 | マルチ組織の階層管理 | 組織管理者, 組織単位管理者, グループ管理者, 基盤提供者, セールスオペレーション |
| GOAL-002 | 統一的なユーザーライフサイクル管理 | ユーザー, 組織管理者, 組織単位管理者, 基盤提供者 |
| GOAL-003 | 完全な監査証跡 | 組織管理者, 基盤提供者, カスタマーサクセス |
| GOAL-004 | イベント駆動連携 | プロダクト提供者, 基盤提供者 |
| GOAL-005 | 拡張可能なロール割当モデル | ユーザー, 組織管理者, プロダクト提供者 |

## アクター一覧

| ID | アクター | 種別 | 説明 |
|----|---------|------|------|
| ACTOR-001 | ユーザー | human | エンドユーザー。ロールに基づいてプロダクトを利用 |
| ACTOR-002 | 組織管理者 | human | 組織全体を管理するロールを持つユーザー |
| ACTOR-003 | 組織単位管理者 | human | 担当OU配下を管理するロールを持つユーザー |
| ACTOR-004 | グループ管理者 | human | 担当グループを管理するロールを持つユーザー |
| ACTOR-005 | プロダクト提供者 | system | 基盤上のSaaSプロダクト（複数） |
| ACTOR-006 | 基盤提供者 | human | akashic-ts基盤の運営者 |
| ACTOR-007 | セールス部門 | human | 基盤提供者側。顧客獲得・組織プロビジョニング |
| ACTOR-008 | セールスオペレーション部門 | human | 基盤提供者側。組織初期設定・OU構築 |
| ACTOR-009 | カスタマーサクセス部門 | human | 基盤提供者側。顧客支援・デプロビジョニング |
