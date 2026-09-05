# iori Cloudflare 移行の再開計画

更新日: 2026-09-05

## 実行方針

リポジトリを public のまま維持し、移行と再検証にも GitHub-hosted runner の `ubuntu-latest` を使います。self-hosted runner の登録やリポジトリの private 化は移行の必須条件にしません。GitHub-hosted runner は public repository で利用できます。[GitHub の runner 仕様](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

各 job の作業領域は `$RUNNER_TEMP` 配下に作り、job をまたぐ移行データと証跡は専用の非公開 R2 bucket に保存します。後続 job は同じデータを新しい作業領域へ復元します。本番操作は、承認者と `main` 制限を設定した `production` Environment から、レビュー済み SHA を指定して手動実行します。

これは修正後の計画です。現行 workflow の `migrate-data` と `verify-import` は self-hosted runner と事前配置した絶対パスを参照しており、手順 2・3 の実装が必要です。この文書変更では workflow、移行スクリプト、本番設定を変更しません。

## 現在地

移行は進行中です。2026-08-16 の実装候補 `ac9f502` を引き継ぎます。Workers、D1、R2、KV、Queues への移行と、Terraform と Wrangler の管理境界は[設計書](../specs/2026-08-16-iori-cloudflare-complete-migration-design.md)を維持します。前回のテスト成功は、本番移行や運用準備の完了を意味しません。

2026-09-05 に GitHub API と実装を照合し、次を確認しました。秘密情報の値、本番データ、Cloudflare の実リソースは参照していません。

- 実装候補は `origin/main` より 50 コミット先にあり、対応する PR は未作成でした。
- リポジトリに登録された self-hosted runner は 0 台でした。修正後の計画では、この台数を開始条件にしません。
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

[Draft PR #486](https://github.com/iwasa-kosui/monorepo/pull/486) を作成済みです。`009dca8` の [GitHub Actions](https://github.com/iwasa-kosui/monorepo/actions/runs/33967148638) では、`apps/iori` の `Run guarded Cloudflare checks` が失敗しています。ローカル検証の成功とは分けて扱い、原因の調査と修正を本番準備前に完了させます。

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

## 2. GitHub-hosted runner で実行できる条件を揃える

**事前条件:** 運用担当者、レビュー済み SHA、staging の匿名データを用意します。PR の検証には fixture だけを使い、本番 credential、state、データを渡しません。

**作業:** [Environment の設定手順](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)に従い、`production` に承認者と `main` の deployment branch 制限を設定します。公開 repository のまま、次の条件を確認します。

1. `migrate-data` と `verify-import` に採用する `ubuntu-latest` 上で、Node.js、pnpm、Terraform、Wrangler と移行ツールの準備手順を確定します。workflow の変更は手順 3 で行い、本番 job の同時実行防止とレビュー済み SHA・`main` の一致検査を維持します。
2. 既存の `.github/workflows/deploy-iori.yml` が使う hosted runner から Lightsail への SSH 経路を前提に、停止・drain・export に必要な接続を事前検証します。接続先と信頼する SSH host key、用途を限定した credential は Environment から供給します。PostgreSQL を一般公開せず、SSH 経由の export を使います。hosted runner の送信元 IP は固定と仮定しません。
3. Cloudflare API と既存の state backend への接続を確認します。移行用 R2 の接続確認は、手順 3 の Terraform 変更で bucket を作成した後に行います。state 用と移行データ用の R2 credential を分け、署名用秘密鍵は移行 job、検証用公開鍵は検証 job に必要な範囲で渡す設定を準備します。鍵や接続情報をデータ bundle に含めません。
4. `$RUNNER_TEMP` 配下の作業領域が repository 外で mode `0700`、ファイルが `0600` であることを検査します。必要なツールを導入した後の空き容量を確認し、データ量から必要容量を見積もります。ピーク使用量と転送・変換・検証時間は、手順 3 の実装後のリハーサルで測ります。
5. 本番の停止時間中は旧 SSH deploy によるサービス再起動を抑止し、書き込み停止を維持する手順を用意します。撤去の承認までは旧 deploy 定義を保持します。

標準 Linux runner の SSD 容量は 14 GB ですが、利用可能な空き容量は実測します。hosted job の実行上限は 6 時間です。現行の移行 60 分・検証 20 分の timeout は、計測に基づいて見直します。収まらない場合はストリーミング、SQL 分割、checkpoint を使う job 分割を設計し直し、リハーサルを再実施します。容量・時間が未確認の状態では本番の停止を開始しません。[runner の仕様](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[Actions の制限](https://docs.github.com/en/actions/reference/limits)

**確認コマンド:** 保護設定の確認と、実装後の runner 内での空き容量確認に使います。前者は credential の値を表示しません。

```bash
gh api repos/iwasa-kosui/monorepo/environments/production \
  --jq '{protection_rules: [.protection_rules[] | {type}], deployment_branch_policy}'
df -Pk "$RUNNER_TEMP"
```

**事後条件:** 承認と `main` 制限が機能し、hosted runner からの接続と権限を確認できます。容量・時間の最終確認は、手順 3 の実装を使う手順 4 のリハーサルで行います。移行用の一時ファイルは失敗時を含む job 終了時の cleanup 対象とします。別 job に同じディスクが残ることには依存しません。Environment の必要な値が設定済みかどうかは、2026-09-05 の調査では未確認です。

## 3. 移行 executor と job 間のデータ受け渡しを実装する

**事前条件:** 実装と fixture 検証は本番接続なしで進めます。staging 実行前に手順 2 の保護設定・既存接続と匿名データを用意し、本項の Terraform 変更で移行用 bucket を作成して接続を検証します。次のファイル変更をレビューしてから本番へ適用します。

**変更対象:** 以下は今後の実装対象です。新規 CLI 名は提案であり、現在は実行できません。

- `.github/workflows/deploy-iori-worker.yml`: runner の変更、手動実行と Environment の検査、一時入力の生成、bundle 保存・復元、cleanup を接続します。
- `apps/iori/infra/cloudflare/{main.tf,variables.tf,outputs.tf}` と `import-existing-resources.mjs`、`apps/iori/scripts/validate-cloudflare-plan.mjs`: state・アプリ画像用とは別の移行用 R2 bucket を Terraform 管理に追加します。import と許可リソースの検査も揃え、bucket 参照は sensitive output として job 内で受け取ります。
- `apps/iori/scripts/execute-cloudflare-migration.mjs` と `migration-bundle.mjs` を新設し、既存 CLI の実行、証跡生成、転送と復元を担当させます。
- `apps/iori/scripts/run-protected-migration.mjs`、`materialize-import-verification-inputs.mjs`、`validate-private-mounted-inputs.mjs`: ホストに事前配置する絶対パスへの依存を除き、job ごとの root に対して署名済みの相対パスを解決します。
- `apps/iori/scripts/verify-cloudflare-import.mjs` と新設する `cloudflare-import-provider.mjs`: provider はレビュー済み SHA に含まれるコードを使います。Environment は接続設定を渡し、外部 module のパスを渡しません。

**移行データの保存:** 専用 R2 bucket は `r2.dev`、custom domain とも公開せず、アプリの Worker から配信する binding も作りません。R2 は既定で非公開ですが、公開設定が無効であることを事前検査します。[R2 public bucket の仕様](https://developers.cloudflare.com/r2/buckets/public-buckets/)

bundle は environment、`main_sha`、`migration_run_id` で識別します。再検証に必要な全 application table の NDJSON、各 manifest、署名付き証跡と、それらが参照する全 artifact を含めます。manifest だけでは実データの再検証はできません。アップロード元の画像は必要量ずつ転送して一時ディスクの重複を減らし、署名対象に含めたファイルは必ず bundle に保存します。Terraform state・plan、生成 config、credential、署名用秘密鍵は含めず、config は各 job で再生成します。GitHub artifact、cache、公開ログには移行データを保存しません。

全ファイルの転送と照合後に完了 marker を最後に保存し、後続 job は完了済み bundle だけを受け付けます。同じ run ID の完了済みデータを上書きしません。途中失敗では完了 marker を作らず、再開可能な checkpoint と再実行禁止の phase を区別します。bundle は cutover 完了から少なくとも 14 日間保持し、進行中・失敗中の run を一律 TTL で削除しません。保持期間と照合結果を確認し、削除承認後に cleanup します。

**署名形式:** 現行の絶対パスを含む contract を、そのまま別 root に書き換えると署名が壊れます。新しい contract version では artifact の参照を bundle 内の相対パスにし、復元先 root は署名対象から分離します。検証時は署名済み bytes を変更せず、絶対パス、`..`、symlink による root 外参照を拒否します。旧 contract は新 workflow の入力として拒否します。検証用公開鍵とその digest は Environment を信頼元とし、bundle から取得しません。provider のコードも bundle から読み込みません。

**実行順序:** protected Environment の GitHub-hosted runner から、次の順序で既存 CLI を実行し、その実行結果から署名付き証跡を生成します。

1. 既存リソースを Terraform に import します。
2. 新規書き込みを停止し、Fedify Queue を drain して深さ 0 を確認し、配送処理を停止します。
3. PostgreSQL と uploads を export します。
4. D1 schema を適用し、変換した SQL を import します。
5. R2 import と OGP backfill を実行します。
6. 移行元の実データ・manifest と移行先の内容を照合し、署名付き証跡を生成して bundle を保存します。
7. `cutover-route` の `verify-import` は別の新しい runner で同じ bundle を復元し、署名・全ファイルと D1/R2/OGP の実データを再検証します。一致後にだけ route の変更へ進みます。

現在の `IORI_IMPORT_RUNNER` は移行先を照合する provider module です。これを用意するだけでは停止・export/import・署名生成は実行されません。既存の `cloudflare:migrate:protected` は検証コマンドとして維持し、executor の入口とは分けます。

**実装後の呼び出し仕様:** 新設する `cloudflare:migrate:execute` で停止から bundle 保存までを実行します。`cloudflare:migrate:protected` は bundle 復元後の検証に使います。executor と復元処理は未実装のため、この計画だけを根拠に workflow を dispatch しません。

**検証:** fixture で、phase 失敗時の後続停止、分割 SQL の全ファイル投入、途中転送・同一 run ID の上書き拒否、署名・SHA・run ID 不一致、root 外参照の拒否を確認します。異なる root に全 NDJSON と署名済みファイルを復元し、署名を書き換えずに再検証できることをテストします。Terraform の bucket 追加と public artifact gate も検証します。

**事後条件:** staging の匿名データで、停止、export/import、署名生成、R2 保存、別 job での復元と実データ再検証まで成功します。接続切断・容量不足・timeout で失敗したときの再開または rollback を確認し、CLI の実出力に基づく証跡を使います。事前配置したホストのディレクトリがなくても再現できます。

## 4. リハーサル、本番切替、旧環境の撤去

**事前条件:** 手順 1〜3 が完了し、レビュー済み実装が `main` に取り込まれています。停止時間、対象 SHA、rollback 方針、本番切替の承認を確認します。

**コマンドと順序:** [cutover runbook](../../../apps/iori/docs/operations/cloudflare-cutover-runbook.md)に従い、staging smoke、移行リハーサル、本番の停止移行、workers.dev smoke、route 切替、本番 smoke を順に実施します。workflow の dispatch は手順 2・3 の不足を解消しません。

**事後条件:** HTTP、ActivityPub、Web Push、Queue retry/DLQ、D1/R2 の照合を確認します。cutover から 14 日間は Lightsail、PostgreSQL、uploads の backup、AWS state を保持します。14 日分の確認結果と destroy plan への明示承認後に、旧環境の撤去を別の変更として進めます。

## 完了の判定

- Draft PR とローカル検証: 実装候補のレビュー準備
- hosted runner 対応・保護設定・接続と容量の確認・executor・bundle 復元と staging リハーサル: 本番操作の準備
- 本番 route 切替と機能確認: Cloudflare での稼働開始
- 14 日間の確認と承認済み AWS 撤去: 完全移行の完了

各段階の実行日、対象 SHA、検証結果を記録します。未実行の段階を完了扱いにしません。
