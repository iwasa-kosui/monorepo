# Cloudflare 移行の実行手順

作業者はこの手順で認証・Environment・source・リハーサルを準備し、[cutover runbook](./cloudflare-cutover-runbook.md)の順序で切り替えます。public repository と GitHub-hosted `ubuntu-latest` を使います。以下のコマンドを一括実行せず、各段階の完了条件を確認して進めてください。

## 0. 現在地と作業記録

2026-09-06 の実行前調査で確認した状態です。再開時は再確認してください。この文書の更新によって設定・配備・移行が実施済みになるわけではありません。

| 対象               | 確認結果                                                                                           | 次の作業                                        |
| ------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 実装               | [Draft PR #486](https://github.com/iwasa-kosui/monorepo/pull/486)。`e49ab0e` の CI は全4ジョブ成功 | 最新の PR head をレビューし、明示承認後に merge |
| SSH                | `microblog` への既存認証と厳密な host-key 検証で `true` が成功                                     | source の詳細診断                               |
| Source             | 稼働状態、SHA、固定 Node/pnpm、freeze marker、容量は未確認                                         | 第4節の確認表を埋める                           |
| Cloudflare         | Dashboard とローカル Wrangler は未認証                                                             | 第1節のログインと権限設定                       |
| GitHub Environment | `production` は reviewer・branch 制限なし。`staging` は未作成                                      | 第2節の設定と readback                          |
| Secrets            | 新 workflow の35参照名のうち31名が不足。既存名の存在は値・権限の適合を保証しない                   | 第3節の入力を Environment ごとに準備            |
| 実移行             | source の停止・凍結、resource 作成、import、route 切替は未実施                                     | staging の完了後に production を開始            |

事前調査で拒否された操作は、GitHub 保護設定変更（具体的な設定への明示承認不足）、source 診断スクリプトのローカル作成（実行フックの「低レベル操作」判定）、直接 HTTP 取得です。いずれも実行済みとは扱いません。拒否された操作は、具体的な承認または実行環境の許可が得られるまで別ツールで迂回しません。source の診断は作業者が許可された端末で実施することもできます。

記録には日付、担当者、段階、pass/fail、件数、次の作業を残します。実際の account/resource ID、hostname、secret、DB/画像、state、HTTP body、raw log は非公開領域に保存します。公開 PR や Actions artifact に貼り付けません。

以下は作業者のローカル Bash で行います。レビュー対象の checkout のルートへ移動し、同じシェルを使います。`iori_ops_dir` は repository 外の一時作業領域です。

```bash
umask 077
iori_ops_dir="$(mktemp -d "${TMPDIR:-/tmp}/iori-operator.XXXXXX")"
iori_repo='iwasa-kosui/monorepo'
export WRANGLER_SEND_METRICS=false
export WRANGLER_LOG_PATH="$iori_ops_dir/wrangler.log"
```

ディレクトリは mode `0700`、配下のファイルは `0600` で管理します。shell trace を有効にしません。作業終了時は必要な記録を承認済みの非公開保管先へ移し、この作業で作った一時領域だけを削除します。

## 1. Cloudflare の認証

1. 作業者が [Cloudflare Dashboard](https://dash.cloudflare.com/login) に既存アカウントでログインします。パスワードや token をチャットへ送る必要はありません。
2. 対象 account・zone、R2 の利用可否、担当者の作成権限を Dashboard で確認します。新しい課金契約が必要なら、その契約を承認してから進めます。
3. ローカル CLI を使う場合は、repository の固定 Wrangler で OAuth 認証を行います。ブラウザーのログインと CLI の認証は別々に確認します。

```bash
pnpm --silent --filter iori exec wrangler login >"$iori_ops_dir/login.log" 2>&1
pnpm --silent --filter iori exec wrangler whoami >"$iori_ops_dir/whoami.log" 2>&1
```

ブラウザーで要求される権限を確認して認証を完了します。終了コードと非公開の `whoami.log` で対象 account への認証を確認し、公開記録には pass/fail だけを残します。認証 URL も公開しません。CLI の仕様は [Wrangler の認証コマンド](https://developers.cloudflare.com/workers/wrangler/commands/general/#login)を参照してください。

**完了条件:** 対象 account と実行に必要な認証が確認できる。ローカル OAuth の成功だけで Actions の role token が設定済みとは扱わない。

## 2. GitHub Environment の保護

`production` と `staging` の両方に、次の具体的な設定を適用します。この設定案への承認と、後続 job の実行承認を記録してください。

| 設定                         | 今回の設定案                       |
| ---------------------------- | ---------------------------------- |
| Required reviewers           | `iwasa-kosui`                      |
| Wait timer                   | 0分                                |
| Prevent self-review          | 無効。起動者本人による承認を許可   |
| Deployment branches and tags | Selected branches and tags         |
| 許可する規則                 | 種別 Branch、名前 `main` の1件のみ |

GitHub repository の **Settings → Environments** で設定します。既に別の保護規則が追加されている場合は、この表で上書きせず差分を確認します。本人による承認を禁止する方針なら、別の承認者を決めてから設定案を変更します。

設定後、各 Environment の読み戻しを行います。最初は `staging`、次に変数を `production` に変更して同じ2コマンドを実行します。

```bash
iori_environment=staging
gh api "repos/$iori_repo/environments/$iori_environment" \
  --jq '{rules: [.protection_rules[] | {type, wait_timer, prevent_self_review, reviewers: [.reviewers[]? | .reviewer.login]}], policy: .deployment_branch_policy}'
gh api --paginate "repos/$iori_repo/environments/$iori_environment/deployment-branch-policies?per_page=100" \
  --jq '.branch_policies[] | {name, type}'
```

**完了条件:** required reviewer が存在し、custom branch policy が有効で、許可規則が `main` branch の1件だけ。Environment 名の存在だけでは完了しない。[Environment API](https://docs.github.com/en/rest/deployments/environments#create-or-update-an-environment) と [branch policy API](https://docs.github.com/en/rest/deployments/branch-policies)は別の設定です。

source deploy は対象 path の `main` push でも起動します。**source credential の供給と merge より前に、この保護を完了してください。** Ready 化・merge は明示承認後に行い、merge により起動した source job は第4節の前提が揃うまで承認しません。

## 3. 移行先と Environment inputs の準備

### 3.1 Backend と用途別 credential

1. 移行用の Terraform state bucket を別途作成します。アプリ画像用・移行 bundle 用 bucket と共有せず、既存 state を移動しません。
2. 新しい staging generation と run ID を選び、非公開の作業記録に固定します。generation は先頭が小文字英字の8〜20文字の小文字英数字、run ID は英数字・`_`・`-` の1〜80文字です。
3. [infra の操作別権限表](../../infra/cloudflare/README.md#environment-references)に従い、5用途の Cloudflare API token と、state・transfer・application 各用途の読み書き用／読み取り専用 S3 credential を分けます。
4. S3 credential は対象 bucket に限定します。新規 bucket は `prepare-target` が作るため、transfer の書き込み権限は未作成の予定名へ事前に限定する必要があります。この設定可否を確認し、Dashboard で既存 bucket しか選べない場合は、Cloudflare の bucket resource 指定を使う token 作成手順を別途レビューします。手動で target bucket を先に作ると fresh-generation 検査に失敗します。
5. Account の `workers.dev` subdomain を Dashboard で確認し、未登録なら `prepare-target` より前に登録します。staging の Worker hostname は `iori-staging-<generation>.<登録済みsubdomain>.workers.dev`、production は同じ形で environment 部分を `production` にします。固定 Wrangler の非対話 deploy に初回登録を任せると、リソース作成後に失敗して部分 generation が残るため、hosted job では登録しません。[workers.dev の設定](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)を参照してください。

R2 の S3 credential と Cloudflare REST API token は別に扱います。作成方法・bucket scope は [R2 認証手順](https://developers.cloudflare.com/r2/api/tokens/)を参照してください。API token の実際の permission と readback API の適合も確認します。通常の広い token を全 role に流用して完了扱いにしません。

### 3.2 登録する参照名

値は GitHub の **Settings → Environments → 対象 Environment → Environment secrets** へ登録します。下表の prefix はそれぞれ `_ACCESS_KEY_ID` と `_SECRET_ACCESS_KEY` の2件です。全35名を網羅しています。

| 用途            | Secret 名または prefix                                                                                                                                                                | 値の準備元                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 移行先          | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `IORI_TERRAFORM_BACKEND_BUCKET`, `ORIGIN`                                                                                              | 確認済み account・zone・独立 backend・canonical origin           |
| 実行 identity   | `IORI_ADMISSION_IDENTITY`                                                                                                                                                             | 次項の同じ environment/generation/SHA/run と smoke 対象          |
| API role        | `IORI_CLOUDFLARE_PREPARE_API_TOKEN`, `IORI_CLOUDFLARE_MIGRATE_API_TOKEN`, `IORI_CLOUDFLARE_VERIFY_API_TOKEN`, `IORI_CLOUDFLARE_CUTOVER_API_TOKEN`, `IORI_CLOUDFLARE_DEPLOY_API_TOKEN` | 第3.1節の用途別 token                                            |
| State S3        | `IORI_TERRAFORM_WRITE`, `IORI_TERRAFORM_READ_ONLY`                                                                                                                                    | Backend bucket に限定した2組                                     |
| Transfer S3     | `IORI_TRANSFER_R2_WRITE`, `IORI_TRANSFER_R2_READ_ONLY`                                                                                                                                | 非公開 bundle bucket に限定した2組                               |
| Application S3  | `IORI_APPLICATION_R2_WRITE`, `IORI_APPLICATION_R2_READ_ONLY`                                                                                                                          | 対象 generation の画像 bucket に限定した2組                      |
| Source SSH      | `IORI_SOURCE_SSH_HOST`, `IORI_SOURCE_SSH_USER`, `IORI_SOURCE_SSH_PRIVATE_KEY`, `IORI_SOURCE_SSH_KNOWN_HOSTS`                                                                          | 許可された source と信頼済み host key                            |
| 署名            | `IORI_MIGRATION_RECEIPT_PRIVATE_KEY`, `IORI_MIGRATION_RECEIPT_PUBLIC_KEY`, `IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256`                                                                 | Ed25519 秘密鍵、対応する公開鍵 PEM、公開鍵ファイルの SHA-256 pin |
| 実測            | `IORI_MIGRATION_REHEARSAL`                                                                                                                                                            | 第5節の JSON。ファイル path ではなく内容                         |
| Smoke / staging | `SMOKE_QUEUE_TOKEN`, `STAGING_ACCESS_TOKEN`                                                                                                                                           | 互いに異なる16〜1,024文字のランダム ASCII                        |
| Web Push        | `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`                                                                                                                              | 既存購読と対応する承認済み VAPID 設定                            |

既存の `MICROBLOG_*`、`IORI_VAPID_*`、汎用 `CLOUDFLARE_API_TOKEN` は、新しい名前への自動マッピングではありません。GitHub API から secret 値を取り出すこともできません。既存の安全な保管元から適合する値を用意します。特に staging の source SSH を本番へ向けないでください。

CLI で1件ずつ登録する場合は、値を command argument にせず、承認済みの mode `0600` ファイルを標準入力に渡します。これは登録例であり、全値を自動生成するコマンドではありません。

```bash
gh secret set IORI_MIGRATION_RECEIPT_PUBLIC_KEY \
  --repo "$iori_repo" --env "$iori_environment" \
  < "$iori_ops_dir/receipt-public.pem"
gh secret list --repo "$iori_repo" --env "$iori_environment"
```

### 3.3 Identity の照合

`IORI_ADMISSION_IDENTITY` は JSON 内容を登録します。値は実データ・実リソースから選び、次の対応を検査します。

| JSON field                                                  | 対応する値                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `environment`, `generation`, `runId`                        | workflow の `environment`, `generation`, `migration_run_id`                   |
| `mainSha`                                                   | 移行に使うレビュー済み最新 main の40桁 SHA                                    |
| `hostname`                                                  | `ORIGIN` の canonical hostname                                                |
| `workerHostname`                                            | 新 generation の確認済み workers.dev hostname                                 |
| `smoke.username`, `smoke.uploadFilename`, `smoke.articleId` | 移行対象に存在し、完全な smoke checklist を実行できるユーザー・画像・公開記事 |

fixture のゼロ UUID や仮の hostname を本番へ登録しません。初回準備後は identity を同じ migration の途中で差し替えません。詳細な独立 target と prepared record の照合は [infra README](../../infra/cloudflare/README.md)に従います。

**完了条件:** 参照名、対象、権限、鍵の対応、実測 profile、identity が揃う。各 role の実接続が検証できるまで credential 名だけで pass にしない。

## 4. Source の診断と事前配備

最初の接続だけなら、既存の SSH 設定を使って次を実行します。これは source が移行可能であることを証明する検査ではありません。

```bash
ssh -T -a -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no -o ConnectTimeout=15 microblog true \
  >"$iori_ops_dir/source-connect.log" 2>&1
```

詳細診断は許可済みの端末から service user として行い、値を非公開で記録します。未確認・不一致を見つけたら、修正内容を具体化して事前配備より前に解消します。

| 確認            | 操作・対象                                                    | 完了条件                                                                         |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 稼働状態        | `systemctl is-active microblog`                               | `active`。停止を drain の証拠にしない                                            |
| Checkout        | `$HOME/monorepo` の revision と tracked 変更                  | 配備前の revision を記録。変更があれば保持方針を決める                           |
| Runtime         | `$HOME/.nvm/versions/node/v24.12.0/bin/node`                  | 実体・所有者・実行権限・安全な mode を確認し、version が `v24.12.0`              |
| Package manager | `$HOME/.local/share/pnpm/pnpm`                                | 同じ metadata 検査を行い、version が `10.12.4`。symlink を別実体へ自動追従しない |
| 凍結            | `$HOME/.iori-migration/freeze.json` と `freeze.pending`       | 両方の有無を確認。存在したら再配備・再起動せず、その run の復旧判断へ進む        |
| Private control | `.iori-migration` の mode、owner、`control.sock`、control CLI | 同じ service user、所定の private 配置。初回未配備ならその事実を記録             |
| 容量            | source export 先と runner の空き容量、実データ量              | [容量・時間の条件](./cloudflare-data-migration.md)を満たす                       |

本番 source の事前配備は、環境保護・固定 runtime・既存 DB/TLS 設定の保持・最新 main のレビューと明示承認が揃ってから `deploy-iori.yml` で行います。merge で同じ SHA の source job が起動済みなら、それを確認し、重複 dispatch しません。DB schema の push はこの事前配備に含みません。

```bash
gh workflow run deploy-iori.yml --repo "$iori_repo" --ref main
```

この workflow は入力なしで **production 固定の配備** を行います。診断コマンドでも、staging source の構築入口でもありません。別途準備する匿名化 source にこの workflow を流用しません。

配備後の status は、source 上の service user のシェルで以下を実行します。事前に配備記録の SHA と run ID を `iori_source_main_sha`・`iori_source_run_id` に設定し、mode `0700` の非公開領域を `iori_source_ops_dir` に指定します。raw response を公開しません。

```bash
umask 077
"$HOME/.nvm/versions/node/v24.12.0/bin/node" \
  "$HOME/monorepo/apps/iori/scripts/source-control.mjs" \
  status "$iori_source_main_sha" "$iori_source_run_id" \
  >"$iori_source_ops_dir/source-status.json" 2>"$iori_source_ops_dir/source-status.log"
```

`source-control-client.mjs` は library であり、直接の CLI 入口ではありません。status は既知の SHA/run を渡して照合する操作で、未知の build SHA や既存 freeze の run を探す操作ではありません。既存 marker/socket を作り直して成功させず、status が返す起動中 build SHA と配布 manifest の検証まで確認します。

**完了条件:** 必要な runtime・source control が配備され、build SHA と配布物が一致し、意図しない凍結や dirty checkout がない。ローカル SSH の成功とは別に、hosted runner からの接続も確認する。

## 5. 初回 staging rehearsal の準備

初回の実測 profile を作る専用 hosted operation は現行 workflow にありません。`migrate-data` は開始前にその profile を要求するため、初回計測目的で dispatch しても先へ進めません。CI の `run-migration-fixture.mjs` と合成 PostgreSQL テストは機能検証であり、実移行の容量・所要時間の証拠にはしません。

作業者は、隔離した匿名化 PostgreSQL/upload source、そこで動く同じ SHA の source control、専用 staging の SSH 接続、実在する smoke 対象を準備します。代表サンプルを同じ adapter と GitHub-hosted runner で処理する計測手順を別途レビューし、実行したコマンド・サンプル件数・bytes・経過時間・ピーク容量を非公開に記録してください。未整備なら、この計測手順の整備が次の作業です。

計測結果は [データ移行手順の profile 形式](./cloudflare-data-migration.md)に従い、`iori-migration-rehearsal/v1` の JSON にします。レビュー済み `main_sha`、`measured_at`、正の有限値の `bytes_per_second`・`rows_per_second`・`files_per_second`・`ogp_per_second`、適用する `d1_capacity_bytes` を含めます。実測値に基づく保守的な throughput を採用します。

**完了条件:** 同じ SHA の実測 profile を登録し、source/runner/D1/metadata/time の条件を満たす。staging の全工程、別 runner の復元と再検証、認証・投稿・配送などの手動確認が成功するまで、本番を凍結しない。

## 6. Hosted workflow の実行

### 6.1 実行を固定する

この節は第1〜5節の該当する前提が揃い、PR のレビューと明示承認後の merge が完了してから使います。`prepare-target` は profile/source の配備前にも実行できますが、認証・Environment・その操作の credential・確定 identity は必要です。

```bash
iori_main_sha="$(gh api "repos/$iori_repo/commits/main" --jq .sha)"
iori_environment=staging
iori_generation='<承認済みの新しいgeneration>'
iori_migration_run_id='<固定した移行runID>'
```

`iori_main_sha` をレビュー対象および Environment の identity/profile と照合します。main が進んだら実行を止めて再レビューし、古い identity を黙って書き換えません。PR head をそのまま main SHA として使いません。

### 6.2 一段階ずつ dispatch する

最初は `prepare-target` を指定します。1回の実行が成功し、次の行の前提も満たしてから `iori_operation` だけを変更して同じコマンドを使います。

```bash
iori_operation=prepare-target
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha="$iori_main_sha" \
  -f operation="$iori_operation" \
  -f environment="$iori_environment" \
  -f generation="$iori_generation" \
  -f migration_run_id="$iori_migration_run_id"
```

| 順序 | Operation        | 次へ進む条件                                                                                                                              |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `prepare-target` | Fresh state、sealed Worker、route absent、Queue 配送停止、consumer と prepared record の実 readback が成功                                |
| 2    | `migrate-data`   | source/profile/容量を事前検査後、凍結・drain、全 import・照合、署名 bundle と complete marker の保存が成功                                |
| 3    | `verify-import`  | 別の新しい runner で bundle を復元し、署名・D1/R2/OGP の実データを再検証して成功                                                          |
| 4    | `cutover-route`  | 同じ job 内の fresh restore、workers.dev smoke、route、canonical smoke、source 凍結の照合、HTTP 有効化、Queue の最後の再開と smoke が成功 |

Actions が返した run を開き、対象 operation、environment、generation、run ID、event SHA を確認して Environment の pending deployment を承認します。承認を回避するために Environment 設定を緩めません。run の識別には dispatch 直後の一覧も使えますが、「最新の1件」だけで断定せず日時と入力を照合します。

`cutover-route` の dispatch は、別 job の `verify-import` も先行実行します。その後、切替 job 自身がさらに fresh restore と再検証を行います。前の standalone `verify-import` の成功は、この2つの検証の代わりにはなりません。

```bash
gh run list --repo "$iori_repo" --workflow deploy-iori-worker.yml \
  --branch main --event workflow_dispatch --limit 10 \
  --json databaseId,headSha,status,conclusion,createdAt
iori_actions_run_id='<照合済みのActions run番号>'
gh run view "$iori_actions_run_id" --repo "$iori_repo" \
  --json status,conclusion,jobs
```

HTTP body や raw log を取得・公開せず、各 job の sanitized status を確認します。dispatch が成功しただけでは移行成功ではありません。失敗・timeout・結果不明なら、新しい操作や再実行を始める前に第7節へ進みます。

staging が完了したら、production に異なる generation・リソース・source・identity を用意し、同じ順序を実施します。production のメンテナンス告知は担当者と内容を決め、送信承認後に行います。`deploy-worker` は active generation の通常更新用で、初回移行には使いません。

## 7. 中断と引き継ぎ

| 中断地点                      | 維持する状態                            | 次の対応                                                             |
| ----------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| 認証・保護・source 診断で停止 | 稼働中 source を維持                    | 未確認項目・拒否された操作・必要な担当者を記録                       |
| 準備の結果が不明              | 部分生成した generation と state を保持 | 実 readback で状態を特定。generation を再利用して自動再実行しない    |
| 凍結後、HTTP 有効化前         | Source の凍結、予約、部分 import を保持 | 移行先書き込みが未有効であることを確認し、明示承認した復旧だけを実施 |
| HTTP 有効化後                 | 旧 source を凍結したまま保持            | 移行先での復旧を優先し、差分を照合するまで旧 source を再開しない     |

具体的な復旧条件は [cutover runbook の Rollback](./cloudflare-cutover-runbook.md#4-rollback)に従います。`reconcile-resources` と `replace-queue-consumer` は現行 workflow が権限使用前に拒否する保守用の未提供操作です。復旧の代用として dispatch しません。

完了後も14日間の監視・保持を続け、AWS retirement は保持証跡と destroy plan のレビュー・明示承認後の別作業とします。実行者は「最後に成功した段階」「確認済みの現在状態」「次の操作」「必要な承認」を残し、次の担当者が同じ run の続行と新規移行を取り違えないようにします。
