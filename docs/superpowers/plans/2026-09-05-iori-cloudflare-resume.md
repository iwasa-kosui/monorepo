# iori Cloudflare 移行の再開計画

更新日: 2026-09-05

## 現在地

移行は進行中です。2026-08-16 の実装候補 `ac9f502` を引き継ぎます。Workers、D1、R2、KV、Queues への移行と、Terraform と Wrangler の管理境界は[設計書](../specs/2026-08-16-iori-cloudflare-complete-migration-design.md)を維持します。前回のテスト成功は、本番移行や運用準備の完了を意味しません。

2026-09-05 に GitHub API と実装を照合し、次を確認しました。秘密情報の値、本番データ、Cloudflare の実リソースは参照していません。

- 実装候補は `origin/main` より 50 コミット先にあり、対応する PR は未作成でした。
- リポジトリに登録された self-hosted runner は 0 台でした。
- `production` Environment の `protection_rules` は空で、`deployment_branch_policy` は `null` でした。Environment 名だけでは承認やブランチ制限は有効になりません。
- `migrate-data` は既存の署名付き証跡と移行結果を検証します。書き込み停止、Queue drain、export/import、署名付き証跡の生成を実行する入口は接続されていません。
- manifest の形式、Queue drain の順序、smoke 対象の指定に実装間の不整合がありました。この再開作業で回帰テストと修正を追加しました。

再開時の検証結果は次のとおりです。smoke の同名検査を重複指定した場合の迂回も修正し、再レビューで仕様適合とコード品質の承認を得ました。

- iori: 66 ファイル、347 テスト成功。他パッケージ: 216 テスト成功
- iori 型検査、全体の `tsc --noEmit` と lint、iori および変更文書の dprint 検査: 成功
- iori build、fixture を使う Worker dry-run、公開成果物検査、dry-run ログ検査: 成功
- Terraform fmt、backend を使わない init、validate: 成功
- 全体 build: `--workspace-concurrency=1` を指定して成功。既定の並列実行では iori の prebuild による `result/dist` 再生成と mdlive の参照が競合したため、逐次実行で確認

本番デプロイ、データ移行、route 切替、AWS 撤去は実行していません。

## 1. 実装候補をレビュー可能にする

**事前条件:** 最新の `origin/main` と前回の実装候補が取得済みで、作業は専用 worktree で行います。本番接続を使わず、Node.js 24.12.0 と固定した依存で検証します。

**作業:** 実際の CLI が生成した manifest を証跡検証へ通し、Queue drain を export より前に揃えます。smoke は必須検査を維持しながら、検査対象のユーザー・画像・記事を環境ごとに指定できるようにします。旧ブランチは残し、検証済みの現在の差分から Draft PR を作成します。

**コマンド:** リポジトリのルートから実行します。

```bash
pnpm --filter result run build
pnpm --filter kosui-me generate:talks
pnpm --filter iori run cloudflare:public-artifacts:check
pnpm --filter iori run typecheck
pnpm --filter iori run lint
pnpm --filter iori run format:check
pnpm --filter iori run test:ci
pnpm --filter iori run build
terraform -chdir=apps/iori/infra/cloudflare fmt -check -recursive
terraform -chdir=apps/iori/infra/cloudflare init -backend=false -input=false
terraform -chdir=apps/iori/infra/cloudflare validate
git diff --check
```

Worker bundle の dry-run には CI と同じ fixture の bindings を渡します。リポジトリ全体の品質チェックは `CLAUDE.md` に従って別途実行し、実行できなかった項目や既存の失敗は PR に記録します。

**事後条件:** 検証結果と残作業を記載した Draft PR が存在します。Ready 化と merge はユーザーの明示承認後に行います。

## 2. 本番操作の実行環境を準備する

**事前条件:** 実行ホストと運用担当者が決まっており、ホストへのアクセス方法を確認済みです。公開リポジトリの PR を、本番データを保持する runner で実行しません。

**作業:** `production` に承認者と `main` の deployment branch 制限を設定し、`iori-production-migration` label を持つ runner を登録します。private directory、必要なツール、DB・Cloudflare・state backend への接続、署名と検証の鍵、実行モジュールを準備します。登録トークンや本番値はこの計画書に記載しません。[Environment の設定手順](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)、[runner の登録手順](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)に従います。

**確認コマンド:** 値やログ本文を出さず、登録状態と保護設定だけを確認します。

```bash
gh api repos/iwasa-kosui/monorepo/actions/runners \
  --jq '{total_count, runners: [.runners[] | {status, busy, labels: [.labels[].name]}]}'
gh api repos/iwasa-kosui/monorepo/environments/production \
  --jq '{protection_rules: [.protection_rules[] | {type}], deployment_branch_policy}'
```

**事後条件:** 対象 runner が online で、承認と `main` 制限が実際に機能します。runner の private directory は repository 外にあり、必要な入力の存在・権限・digest の検査が成功します。秘密情報が設定済みかどうかは、この再開調査では未確認です。

## 3. 移行を実行する入口を接続する

**事前条件:** 手順 2 が完了し、匿名データで検証できる staging 環境があります。停止・配送処理・DB への接続方法が確定しています。

**作業:** protected runner から、次の順序で既存 CLI を実行し、その実行結果から署名付き証跡を生成する executor を実装します。

1. 既存リソースを Terraform に import します。
2. 新規書き込みを停止し、Fedify Queue を drain して深さ 0 を確認し、配送処理を停止します。
3. PostgreSQL と uploads を export します。
4. D1 schema を適用し、変換した SQL を import します。
5. R2 import と OGP backfill を実行します。
6. 移行元の manifest と移行先の内容を照合し、証跡を生成します。

`IORI_IMPORT_RUNNER` は移行先を照合する provider module です。これを用意するだけでは、停止・export/import・署名生成は実行されません。異常終了時には後続処理へ進まないこと、SQL 分割後の全ファイルを投入すること、再実行時の扱いを fixture で検証します。既存の `cloudflare:migrate:protected` を executor として案内しません。

**コマンド:** executor の起動コマンドは未実装です。この項目を実装してレビューするまでは、移行開始コマンドを実行しません。既存の検証コマンドは、全処理が成功して証跡が生成された後に protected runner 上で実行します。

```bash
pnpm --filter iori run cloudflare:migrate:protected
```

**事後条件:** staging の匿名データで、停止から export/import、署名生成、再検証まで一続きに成功します。手製の証跡だけで成功とせず、CLI の実出力と照合結果を使います。

## 4. リハーサル、本番切替、旧環境の撤去

**事前条件:** 手順 1〜3 が完了し、レビュー済み実装が `main` に取り込まれています。停止時間、対象 SHA、rollback 方針、本番切替の承認を確認します。

**コマンドと順序:** [cutover runbook](../../../apps/iori/docs/operations/cloudflare-cutover-runbook.md)に従い、staging smoke、移行リハーサル、本番の停止移行、workers.dev smoke、route 切替、本番 smoke を順に実施します。workflow の dispatch は手順 2・3 の不足を解消しません。

**事後条件:** HTTP、ActivityPub、Web Push、Queue retry/DLQ、D1/R2 の照合を確認します。cutover から 14 日間は Lightsail、PostgreSQL、uploads の backup、AWS state を保持します。14 日分の確認結果と destroy plan への明示承認後に、旧環境の撤去を別の変更として進めます。

## 完了の判定

- Draft PR とローカル検証: 実装候補のレビュー準備
- runner・保護設定・executor と staging リハーサル: 本番操作の準備
- 本番 route 切替と機能確認: Cloudflare での稼働開始
- 14 日間の確認と承認済み AWS 撤去: 完全移行の完了

各段階の実行日、対象 SHA、検証結果を記録します。未実行の段階を完了扱いにしません。
