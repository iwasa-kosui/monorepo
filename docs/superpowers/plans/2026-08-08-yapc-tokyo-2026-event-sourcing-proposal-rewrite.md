# YAPC::Tokyo 2026 Event Sourcing Proposal Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 元原稿のストーリーを維持し、イベントソーシングの有用な手法を目的に合わせて部分適用する価値が伝わる、YAPC::Tokyo 2026向けの短く具体的なプロポーザルを作成する。

**Architecture:** 概要を「パッチワークという主張、聴衆の課題、登壇者の一次経験と部分適用、40分で扱う内容」の4段落に圧縮する。4つの既存データパターンは維持し、現在の状態だけを保存するCRUDをライブ実装の対象、残り3パターンを判断軸の比較対象とする。想定聴衆と提供価値は概要の後に箇条書きで示す。

**Tech Stack:** Markdown、dprint、ripgrep、Ruby、GitHub CLI

## Global Constraints

- ストーリー上の正本はコミット `ffebc8f7a4bfd1ed2fad561dcf5c0e050f073b7a` の `talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md` とする。
- タイトルは「もう他人ごとじゃないイベントソーシング：社会を支える既存システムへの部分適用」とする。
- データについて「現在値」と書かず、「現在の状態」と書く。
- 「社会の礎になるようなプロダクトに関わりたい」を登壇者自身の動機として書かない。
- 元原稿または登壇者本人が明示した内容にない感情、迷い、転機、発言、経験を補わない。
- イベントの記録だけをイベントソーシングそのものと呼ばない。
- 部分適用を全面移行までの未完成な段階ではなく、目的に合う独立した設計判断として扱う。
- ライブ実装は現在の状態だけを保存するCRUDの1パターンに絞り、集計テーブル、外部同期、既存の監査ログは判断軸として比較する。
- 概要は改行を除いて400〜600字に収める。
- 実在する顧客、患者、施設、契約、問い合わせを特定できる情報を書かない。

---

### Task 1: 応募プロポーザルを作成する

**Files:**

- Create: `talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md`

**Interfaces:**

- Consumes: `docs/superpowers/specs/2026-08-08-yapc-tokyo-2026-event-sourcing-proposal-design.md` のストーリー、中心主張、認識変化、技術構成、表現上の制約
- Consumes: `ffebc8f7a4bfd1ed2fad561dcf5c0e050f073b7a:talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md` の一次経験と4つの既存データパターン
- Produces: forteeへ転記できるタイトル、概要、40分のハンズオン構成を持つMarkdown原稿

- [x] **Step 1: 対象ファイルが現行mainに存在しないことを確認する**

Run:

```bash
test ! -e talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
```

Expected: 終了コード0。PR #483の原稿を流用しない。

- [x] **Step 2: 承認済み設計に沿った応募文を作成する**

Create `talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md` with exactly:

```markdown
# YAPC::Tokyo 2026 プロポーザル

## 基本情報

- **形式**: 40分ライブコーディング・ハンズオン
- **対象レベル**: 初級から中級
- **カテゴリ**: ライブコーディング・ハンズオン、アーキテクチャ、データ設計、品質保証

## タイトル

もう他人ごとじゃないイベントソーシング：社会を支える既存システムへの部分適用

## 概要

他人ごとだと思っていた設計手法からエッセンスを学び、それを現実的な方法に変換して社会を支える基盤システムたちへ適用して価値を生んできた、私なりの「パッチワーク」を伝えます。

医療・金融・教育など、社会を支えるプロダクトには、障害や問い合わせ、監査に対して「なぜ現在の状態になったのか」を説明できる品質が必要です。イベントソーシングはそのために有用ですが、「最初からイベント中心に設計しなければ使えない」「考えることが多く、現実的ではない」と思われがちです。

私もそう考えていました。しかし、医療SaaSの共通基盤を担当し、現在の状態しか残っていないデータのために、問い合わせ・障害・監査対応で過去を説明できず苦しみました。そこから、イベントソーシングをそのまま導入するのではなく、必要なエッセンスを既存システムへ部分適用し、現実的な運用コストで説明可能性と監査性を高める「パッチワーク」を実践してきました。

このハンズオンでは、レガシーシステムを模したプロジェクトに、更新処理の境界で業務イベントを記録し、「誰が、いつ、何を、なぜ変えたか」を追える仕組みを追加します。さらに、集計テーブル、外部システム同期、既存の監査ログという3パターンを比較し、自分のシステムに合う現実的な適用方法を探ります。

## 参加してほしい人

- イベントソーシングを何となく知っているが既存システムへの導入は現実的でないと感じている人
- 社会を支えるプロダクトの開発に興味がある人

## 届けたいこと

- イベントソーシングは、システム全体を移行しなくても必要なエッセンスを部分適用できる
- 「誰が、いつ、何を、なぜ変えたか」を残すことで、既存システムでも説明可能性を高められる
- いくつかの実践パターンを比較することで、自分のシステムに合う現実的な適用方法を選べる

## ハンズオン構成

1. 現在の状態だけを保存するCRUDで、あとから説明できない問いを洗い出す
2. 監査性という目的から、記録する業務上のイベントと変更理由を定義する
3. 現在の状態の更新とイベントの保存を実装し、変更の経緯を確認する
4. 集計テーブル、外部同期、既存の監査ログへ同じ判断軸を当てはめる
5. それぞれのパターンで、何を部分的に活用し、何を記録しないかを整理する

参加者は手元でコードを動かしても、ライブコーディングを見るだけでも内容を追えます。特定のイベントストア製品やフレームワークは使いません。
```

- [x] **Step 3: 概要の長さと意味上の必須要素を検証する**

Run:

```bash
ruby -E UTF-8 -e 'text = File.read(ARGV[0]); abstract = text[/^## 概要\n(.*?)^## 参加してほしい人/m, 1]; abort("abstract section not found") unless abstract; puts abstract.delete("\n").length' talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
```

Expected: `545`。400〜600字の範囲内。

Run:

```bash
rg -n '現実的ではない|必要なエッセンスを既存システムへ部分適用|自分のシステムに合う現実的な適用方法' talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
```

Expected: 3つの認識変化・行動変容を表す文がすべて見つかる。

Run:

```bash
rg -n '現在値|社会の礎になるようなプロダクトに関わりたい。けれど|私はうまく想像できていませんでした' talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
```

Expected: 該当なしで終了コード1。

- [x] **Step 4: Markdownを整形する**

Run:

```bash
apps/iori/node_modules/.bin/dprint fmt --config dprint.json talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
apps/iori/node_modules/.bin/dprint check --config dprint.json talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
```

Expected: 整形後の変更がなく、checkが終了コード0。

- [x] **Step 5: 元原稿と設計文書に対して最終レビューする**

Run:

```bash
git diff main...HEAD --check
git diff main...HEAD -- talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
```

Review every paragraph against:

- 元原稿にある事実か
- 主語を聴衆から登壇者へ変えていないか
- 全面移行ではなく、目的に合う手法の部分適用を訴えているか
- ライブ実装する1パターンと、判断軸として比較する3パターンが区別されているか

Expected: `git diff main...HEAD --check` が終了コード0で、設計文書の成功条件をすべて満たす。

- [x] **Step 6: 応募プロポーザルをコミットする**

```bash
git add talks/2026/yapc-tokyo-2026/event-sourcing-auditability.md
git commit -m "docs(yapc): イベントソーシングのプロポーザルを改稿"
```

Expected: 設計文書とは別のコミットとして、応募原稿だけが記録される。

---

### Task 2: 置き換え用のDraft PRを作成する

**Files:**

- No file changes.

**Interfaces:**

- Consumes: Task 1で作成・検証したプロポーザルと、コミット済みの設計文書
- Produces: 閉じたPR #483の内容を引き継がない、main向けの新しいDraft PR

- [x] **Step 1: ブランチと差分を最終確認する**

Run:

```bash
git status --short --branch
git diff main...HEAD --stat
git diff main...HEAD --check
```

Expected: ブランチは `docs/yapc-tokyo-2026-proposal-rewrite`、worktreeはclean、差分は設計書・計画書・応募原稿の3ファイル、diff checkは終了コード0。

- [x] **Step 2: ブランチをpushする**

Run:

```bash
git push -u origin docs/yapc-tokyo-2026-proposal-rewrite
```

Expected: リモートに同名ブランチが作成される。

- [x] **Step 3: Draft PRを作成する**

Create a draft pull request with:

- Base: `main`
- Head: `docs/yapc-tokyo-2026-proposal-rewrite`
- Title: `docs(yapc): イベントソーシングのプロポーザルを改稿`
- Body:

```markdown
## 背景

YAPC::Tokyo 2026向けイベントソーシング案の元のストーリーを維持したまま、YAPC::Fukuoka 2025の採択例を参考にプロポーザルを圧縮します。閉じたPR #483の原稿は引き継ぎません。

## 内容

- 「社会の礎になるプロダクトに関わりたい」を想定聴衆の関心として維持
- 監査性・トレーサビリティを社会を支える品質として具体化
- イベントソーシングを全面移行の二択にせず、目的に合う手法の部分適用として提示
- 4つの既存データパターンを維持し、1つをライブ実装、3つを判断軸として比較
- 概要を約550字へ圧縮し、想定聴衆と提供価値を箇条書きで明示

## 論点

- 登壇者の経験や動機を創作せず、元原稿のストーリーを維持できているか
- 「既存システムには現実的でない」から「必要なエッセンスを部分適用できる」への認識変化が伝わるか
- 40分のライブコーディング・ハンズオンとして実現可能なスコープか
```

Use `gh pr create --draft`, following the repository rule that GitHub operations start with the GitHub CLI.

Expected: main向けのDraft PR URLが返る。

- [x] **Step 4: 作成結果を確認する**

Run:

```bash
gh pr view --json number,state,isDraft,title,baseRefName,headRefName,url
```

Expected: `state` は `OPEN`、`isDraft` は `true`、base/head/titleがStep 3と一致する。
