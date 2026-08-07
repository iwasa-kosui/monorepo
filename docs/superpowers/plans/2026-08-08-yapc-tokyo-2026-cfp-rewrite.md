# YAPC::Tokyo 2026 CFP Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認済みPRDに合わせて、YAPC::Tokyo 2026の応募文を短く熱量のある文章へ書き直します。

**Architecture:** 応募文を「社会を支える仕事への関心」「医療SaaSで説明できなかった経験」「イベント記録から始める実装」「この話を届けたい理由」の順に再構成します。当日の流れも、イベントを正本にする実装から、現在値を正本のままイベントを記録する実装へ変更します。

**Tech Stack:** Markdown、dprint

## Global Constraints

- タイトルは「もう他人ごとじゃないイベントソーシング: 社会を支えるプロダクトにあとから監査性を縫い込む」から変更しません。
- 自己破産案は追加しません。
- 実在する顧客、施設、患者、知人、イベントを特定できる情報は使いません。
- 現在値テーブルを正本として残し、イベント列からの状態再構築は扱いません。
- 記録開始前の過去を復元できるとは書きません。
- イベント記録を、社会を支えるプロダクトに必要な品質の一例として扱います。

---

### Task 1: 応募文と当日の流れを再構成する

**Files:**

- Modify: `talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md`

**Interfaces:**

- Consumes: `talks/2026/yapc-tokyo-2026/prd.md`の主対象者、中心となる主張、応募文の構成、スコープ
- Produces: forteeへ転記できるタイトル、概要、当日の流れ

- [ ] **Step 1: 概要を承認済みの構成へ置き換える**

概要には次の本文を使います。

```markdown
社会の礎になるようなプロダクトに関わりたい。けれど、そこで何が求められるのか、私はうまく想像できていませんでした。

転機は、医療SaaSの共通基盤で、現在値しか残っていないデータに向き合ったことです。値は分かる。でも、誰が、いつ、なぜ変えたのかは分からない。断片的なログと記憶から経緯を推測するたびに気づきました。社会を支えるプロダクトでは、現在値が正しいだけでは足りない。そこへ至った変更を説明できることも品質なのだ、と。

この40分では、現在値しか持たないライセンス管理のCRUDに、「ライセンス数が変更された」というイベントの記録を加えます。TypeScriptとSQLiteを使い、現在値の更新とイベント保存を同じトランザクションで行い、誰が、いつ、なぜ変えたのかを履歴から確認できるところまでライブコーディングします。

これはイベントソーシングそのものではありません。現在値テーブルは正本のままですし、記録を始める前の過去も取り戻せません。それでも、イベントソーシングを採用できる日を待つ必要はない。重要な出来事を記録することなら、今日から始められます。

私は、イベントソーシングを一部の詳しい人だけのものにしたくありません。社会を支える仕事に惹かれている人が、そのために必要な品質を自分のコードで考え始める。イベントを、その入口にしたい。既存CRUDとイベントをつなぐこの実装は、YAPC::Tokyo 2026のテーマ「パッチワーク」にも重なります。聞き終えたとき、「まだイベントソーシングは無理だ」ではなく、「まず、この変更を記録しよう」と思える40分にします。
```

- [ ] **Step 2: 当日の流れを実装範囲へ合わせる**

当日の流れは次の6項目にします。

```markdown
1. 現在値しかないCRUDで、変更理由を説明できないことを確認する
2. 監査ログ、イベント記録、イベントソーシングの違いを整理する
3. `LicenseSeatLimitChanged`を業務イベントとして定義する
4. 現在値の更新とイベント保存を一つのトランザクションで実装する
5. イベント履歴から変更経緯を確認し、保存失敗時のロールバックも試す
6. イベント記録で十分な条件と、イベントソーシングを検討する条件を整理する
```

- [ ] **Step 3: 文面とスコープを検証する**

Run:

```bash
apps/iori/node_modules/.bin/dprint fmt --config dprint.json talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
apps/iori/node_modules/.bin/dprint check --config dprint.json talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
git diff --check
rg -n 'イベント列から現在値を再構築|初期イベント|現在値テーブルを削除|自己破産' talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
```

Expected: dprintと`git diff --check`が成功し、`rg`は該当なしで終了します。

- [ ] **Step 4: 変更をコミットする**

```bash
git add talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
git commit -m "docs(yapc): CFPをイベント記録から始める構成へ変更"
```
