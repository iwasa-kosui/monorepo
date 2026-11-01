# Cloudflare 移行の実行手順

作業者はこの手順で認証・Environment・source・リハーサルを準備し、[cutover runbook](./cloudflare-cutover-runbook.md)の順序で切り替えます。public repository と GitHub-hosted `ubuntu-latest` を使います。以下のコマンドを一括実行せず、各段階の完了条件を確認して進めてください。ユーザーの判断により、今回の移行は staging を使わず production だけで行うため、この文書にある staging の手順は任意です。

## 0. 現在地と作業記録

2026-09-06 の実行前調査で確認した状態です。再開時は再確認してください。この文書の更新によって設定・配備・移行が実施済みになるわけではありません。

| 対象               | 確認結果                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 次の作業                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 実装               | [Draft PR #486](https://github.com/iwasa-kosui/monorepo/pull/486)。`e49ab0e` の CI は全4ジョブ成功                                                                                                                                                                                                                                                                                                                                                                               | 最新の PR head をレビューし、明示承認後に merge                         |
| SSH                | `microblog` への既存認証と厳密な host-key 検証で `true` が成功                                                                                                                                                                                                                                                                                                                                                                                                                   | source の詳細診断                                                       |
| Source             | 稼働状態、SHA、固定 Node/pnpm、freeze marker、容量は未確認                                                                                                                                                                                                                                                                                                                                                                                                                       | 第4節の確認表を埋める                                                   |
| Cloudflare         | Dashboard とローカル Wrangler は未認証                                                                                                                                                                                                                                                                                                                                                                                                                                           | 第1節のログインと権限設定                                               |
| GitHub Environment | 2026-10-31 の readback で `production` と `staging` はともに reviewer 1件、保護ブランチ方式。`staging` の設定が要るのは staging を使う場合だけ。`main` は保護済み                                                                                                                                                                                                                                                                                                                | 第2節の readback で再確認                                               |
| Secrets            | 2026-11-01 の readback で、production では新 workflow の35参照名のうち10名が未登録です。未登録の名前は、`IORI_ADMISSION_IDENTITY`、`IORI_MIGRATION_REHEARSAL`、`IORI_TRANSFER_R2_*` の4名、`IORI_APPLICATION_R2_*` の4名です。workflow は `VAPID_*` の3名を repo レベルの secret から読みます。今回の移行では staging を使いません。staging の Environment には `CLOUDFLARE_ACCOUNT_ID` だけが登録されています。登録済みの名前があっても、値と権限が適合しているとは限りません。 | R2 は第3.1節の手順、identity は第3.3節、rehearsal profile は第5節で準備 |
| 実移行             | source の停止・凍結、resource 作成、import、route 切替は未実施                                                                                                                                                                                                                                                                                                                                                                                                                   | staging を使う場合だけ、staging の完了後に production を開始            |

事前調査で拒否された操作は、当時の GitHub 保護設定変更案、source 診断スクリプトのローカル作成、直接 HTTP 取得です。その後、ユーザーが保護ブランチ方式を選択しました。上表の Environment と `main` の行は、2026-10-31 の API 読み戻しを反映しています。今回エージェントが設定変更を実行したわけではありません。source 診断など旧環境に対する未実行の操作は、作業者が旧環境に直接入らず、管理役に伝えたうえで CI の operation `diagnose-source` で実施します。拒否された操作を別ツールで迂回しません。

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
2. 対象 account・zone、R2 の利用可否、担当者の作成権限を Dashboard で確認します。新しい課金契約が必要なら、その契約を承認してから進めます。この移行は Cloudflare Workers の有料プラン Workers Paid を前提とします。サインインで使う argon2 のハッシュ計算は、workerd 上のテスト `apps/iori/workerd-tests/worker.test.ts` で 1 回あたり約 2.1 秒の CPU 時間がかかりました。無料プランは 1 リクエストあたりの CPU 時間の上限が 10ms なので、サインインが失敗します。有料プランの既定の上限は 30 秒です。切替の前に、対象 account が Workers Paid であることを確認します。
3. ローカル CLI を使う場合は、repository の固定 Wrangler で OAuth 認証を行います。ブラウザーのログインと CLI の認証は別々に確認します。

```bash
pnpm --silent --filter iori exec wrangler login >"$iori_ops_dir/login.log" 2>&1
pnpm --silent --filter iori exec wrangler whoami >"$iori_ops_dir/whoami.log" 2>&1
```

ブラウザーで要求される権限を確認して認証を完了します。終了コードと非公開の `whoami.log` で対象 account への認証を確認し、公開記録には pass/fail だけを残します。認証 URL も公開しません。CLI の仕様は [Wrangler の認証コマンド](https://developers.cloudflare.com/workers/wrangler/commands/general/#login)を参照してください。

**完了条件:** 対象 account と実行に必要な認証が確認できる。ローカル OAuth の成功だけで Actions の role token が設定済みとは扱わない。

## 2. GitHub Environment の保護

`production` で、ユーザーが選択した `protected_branches` 方式を使います。staging を使う場合は、`staging` でも同じ方式を使います。2026-10-31 の API 読み戻しでは、`production` と `staging` の Environment が下表の Required reviewers、Prevent self-review、Deployment branches and tags、API の branch policy と一致しました。再開時は、この節のコマンドで同じ項目を再確認します。required reviewer の設定と、後続 job の実行承認も記録してください。

| 設定                         | 今回の設定案                                                |
| ---------------------------- | ----------------------------------------------------------- |
| Required reviewers           | User 1件                                                    |
| Wait timer                   | 0分                                                         |
| Prevent self-review          | 無効。起動者本人による承認を許可                            |
| Deployment branches and tags | Protected branches only                                     |
| API の branch policy         | `protected_branches: true`, `custom_branch_policies: false` |
| Repository の前提            | `main` に branch protection を設定                          |

設定を変更する場合は、GitHub repository の **Settings → Environments** で操作します。既に別の保護規則が追加されている場合は、この表で上書きせず差分を確認します。本人による承認を禁止する方針なら、別の承認者を決めてから設定案を変更します。

設定を変更した後と再開時に、`production` Environment の読み戻しを行います。staging を使う場合だけ、変数を `staging` に変更して Environment の確認を繰り返します。`main` の保護状態も確認します。

```bash
iori_environment=production
gh api "repos/$iori_repo/environments/$iori_environment" \
  --jq '{rules: [.protection_rules[] | {type, wait_timer, prevent_self_review, reviewers: [.reviewers[]? | .reviewer.login]}], policy: .deployment_branch_policy}'
gh api "repos/$iori_repo/branches/main" --jq '{name, protected}'
```

**完了条件:** `production` に required reviewer が存在し（staging を使う場合は `staging` にも存在し）、`protected_branches=true`、`custom_branch_policies=false`。`main` は branch protection が有効で、API の `protected` が `true`。個別の deployment branch policy は作成しません。

**2026-10-31 の結果:** `gh api` の読み戻しで、`production` は required reviewer が User 1件、`prevent_self_review=false`、`protected_branches=true`、`custom_branch_policies=false` でした。`staging` も同じ値でした。`staging` の確認が要るのは、staging を使う場合だけです。`main` は `protected=true` でした。

Environment は保護されたブランチを許可し、`main` だけに限定するものではありません。対象を `main` に固定するのは、source/Worker workflow の `GITHUB_REF=refs/heads/main` と最新 main SHA の一致検査です。この2つの制御を維持します。repository に branch protection rule が1件もない場合、Protected branches only でも全ブランチが許可されるため、Environment の設定だけで完了としません。[GitHub の deployment branch 制限](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags)

source deploy は対象 path の `main` push でも起動します。この保護は 2026-10-31 の読み戻しで有効を確認しました。**source credential の供給と merge より前に、この保護が維持されていることを再確認してください。** Ready 化・merge は明示承認後に行い、merge により起動した source job は第4節の前提が揃うまで承認しません。

## 3. 移行先と Environment inputs の準備

### 3.1 Backend と用途別 credential

1. 移行用の Terraform state bucket を別途作成します。アプリ画像用・移行 bundle 用 bucket と共有せず、既存 state を移動しません。
2. 新しい generation と run ID を選び、非公開の作業記録に固定します。generation は先頭が小文字英字の8〜20文字の小文字英数字、run ID は英数字・`_`・`-` の1〜80文字です。
3. [infra の操作別権限表](../../infra/cloudflare/README.md#environment-references)に従い、5用途の Cloudflare API token と、state・transfer・application 各用途の読み書き用／読み取り専用 S3 credential を分けます。
4. S3 credential は対象 bucket に限定します。新規 bucket は `prepare-target` が作るため、transfer の書き込み権限は未作成の予定名へ事前に限定する必要があります。Dashboard では既存の bucket しか選べないので、transfer の書き込み token は「[未作成の bucket に限定した R2 S3 credential の作成](#未作成の-bucket-に限定した-r2-s3-credential-の作成)」の手順で作ります。手動で target bucket を先に作ると fresh-generation 検査に失敗します。
5. Account の `workers.dev` subdomain を Dashboard で確認し、未登録なら `prepare-target` より前に登録します。production の Worker hostname は `iori-production-<generation>.<登録済みsubdomain>.workers.dev` です。staging を使う場合の Worker hostname は、同じ形で environment 部分を `staging` にします。固定 Wrangler の非対話 deploy に初回登録を任せると、リソース作成後に失敗して部分 generation が残るため、hosted job では登録しません。[workers.dev の設定](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)を参照してください。

R2 の S3 credential と Cloudflare REST API token は別に扱います。作成方法・bucket scope は [R2 認証手順](https://developers.cloudflare.com/r2/api/tokens/)を参照してください。API token の実際の permission と readback API の適合も確認します。通常の広い token を全 role に流用して完了扱いにしません。

### 未作成の bucket に限定した R2 S3 credential の作成

**前提と対象**

- この小節は、transfer bucket と application bucket の S3 credential だけを扱います。state 用の `IORI_TERRAFORM_*` は既存の backend bucket が対象なので、Dashboard の R2 token 作成画面で作れます。
- Dashboard の R2 token 作成画面では、既存の bucket しか選べません。2026-10-31 に確認しました。未作成の名前を入力すると「No matching buckets」と表示されます。
- transfer bucket と application bucket は、`prepare-target` が Terraform で作ります。手動で bucket を作ると fresh-generation 検査に失敗するので、手動では作りません。
- bucket 名は `infra/cloudflare/main.tf` の `generation_prefix` から決まります。transfer bucket の名前は `iori-<environment>-<generation>-transfer` で、application bucket の名前は `iori-<environment>-<generation>-uploads` です。
- run ID は bucket 名にも token の範囲にも入りません。run ID が入るのは transfer bucket の中の key prefix だけです。このため、token の作成は run ID の確定を待ちません。
- token の範囲は bucket 名で限定されます。このため、generation ごとに token を作り直します。Environment secret の名前は generation で区別されないので、新しい generation の secret は古い generation の secret を上書きします。新しい generation の secret を登録した後に、古い generation の子 token を削除します。ただし、計測用の generation の子 token は、`purge-rehearsal-target` が成功した後に削除します（「計測用の generation での扱い」を参照）。

**ユーザーと作業者の分担**

- 親 token の値は、作成ボタンを押した後の Dashboard の画面に表示されます。親 token は Account API Tokens Edit を持つので、ほかの token を発行できます。
- ユーザーが、次の 2 つを行います。
  - 親 token の作成ボタンを押した後の画面で、Copy ボタンを押すこと
  - 自分の端末で、親 token を読み込む zsh（「準備」の手順 2 と、段階 A と段階 B の zsh）を実行すること
- 作業者は、それ以外の Dashboard の画面を操作します。対象は、親 token の権限の選択、token の一覧、期限の確認、token の削除です。作業者は Claude in Chrome で操作してもかまいません。
- 作業者は、token の値が表示される画面に遷移しません。作業者は、その画面のスクリーンショットを撮りません。
- ユーザーは、zsh が親 token を読み込んだ後に、親 token の値が表示されたタブを閉じます。ユーザーは、タブを閉じてから作業者に操作を戻します。作業者は、そのタブを再利用しません。
- 子 token は Dashboard で作りません。子 token は、ユーザーの端末の zsh が API で作ります。子 token の値は、Dashboard にも作業者の画面にも表示されません。

| Secret prefix                   | bucket             | permission group                     | 使う operation                                                              | 作る時期              | 期限         |
| ------------------------------- | ------------------ | ------------------------------------ | --------------------------------------------------------------------------- | --------------------- | ------------ |
| `IORI_TRANSFER_R2_WRITE`        | transfer bucket    | Workers R2 Storage Bucket Item Write | `prepare-target`、`rehearse-migration`、`migrate-data`                      | `prepare-target` の前 | `EXPIRES_ON` |
| `IORI_TRANSFER_R2_READ_ONLY`    | transfer bucket    | Workers R2 Storage Bucket Item Read  | `verify-import`、`cutover-route`、`deploy-worker`、`purge-rehearsal-target` | `prepare-target` の後 | なし         |
| `IORI_APPLICATION_R2_WRITE`     | application bucket | Workers R2 Storage Bucket Item Write | `rehearse-migration`、`migrate-data`、`purge-rehearsal-target`              | `prepare-target` の後 | `EXPIRES_ON` |
| `IORI_APPLICATION_R2_READ_ONLY` | application bucket | Workers R2 Storage Bucket Item Read  | `verify-import`、`cutover-route`                                            | `prepare-target` の後 | `EXPIRES_ON` |

各 prefix には、末尾に `_ACCESS_KEY_ID` と `_SECRET_ACCESS_KEY` を付けた 2 つの secret があります。`deploy-worker` は移行後も毎回、`IORI_TRANSFER_R2_READ_ONLY` で準備記録を読みます。このため、`IORI_TRANSFER_R2_READ_ONLY` には期限を付けません。Bucket Item Read は bucket 全体の読み取りと一覧を許すので、この credential は transfer bucket の移行 bundle も読めます。移行 bundle をいつ、どう削除するかは、[#498](https://github.com/iwasa-kosui/monorepo/issues/498) で決めます。

`EXPIRES_ON` は、`cutover-route` の完了予定日に 14 日を足した日時にします。14 日は、`migrate-data` の遅延や再実行に備えた余裕です。

**計測用の generation での扱い**

- 5.x 節の計測（計測1〜計測3）では、本番用とは別の使い捨て generation を使います。作業者は、計測でもその generation の bucket に限定した子 token を作ります。
- 計測で使う子 token は、`IORI_TRANSFER_R2_WRITE`、`IORI_TRANSFER_R2_READ_ONLY`、`IORI_APPLICATION_R2_WRITE` の 3 つです。`rehearse-migration` は `IORI_TRANSFER_R2_WRITE` と `IORI_APPLICATION_R2_WRITE` を使います。`purge-rehearsal-target` は `IORI_TRANSFER_R2_READ_ONLY` と `IORI_APPLICATION_R2_WRITE` を使います。計測の run ID では、`verify-import` と `cutover-route` を実行しないので、`IORI_APPLICATION_R2_READ_ONLY` は作りません。
- 計測では、段階 A を計測1 の前に行います。段階 B は計測2 の前に行い、`transfer-read-only` と `application-write` の作成と疎通確認だけを実行します。`transfer-read-only` は、準備記録を読む `purge-rehearsal-target` のために、`prepare-target` の後に作ります。計測の完了条件では、登録済みの secret は 6 つです。
- 計測用の `EXPIRES_ON` は、計測2 の実施予定日に 7 日を足した日時にします。`transfer-read-only` には期限がないので、削除を忘れると残ります。
- 計測用と本番用の generation は、production Environment の同じ secret 名を使います。本番用の段階 A は、計測用の `IORI_TRANSFER_R2_WRITE` を上書きします。本番用の段階 B は、計測用の `IORI_TRANSFER_R2_READ_ONLY` と `IORI_APPLICATION_R2_WRITE` を、本番用 generation の bucket に限定した token の値で上書きします。上書きされた値では、計測用 generation の bucket に認証できないので、`purge-rehearsal-target` が失敗します。このため、作業者とユーザーは、計測1〜計測3 と `purge-rehearsal-target` をすべて終えてから本番用の段階 A を行います。
- `deploy-iori-worker.yml` の `TODO(iori-cutover)` を戻すまで、workflow は `IORI_APPLICATION_R2_WRITE` ではなく `IORI_TRANSFER_R2_WRITE` を読みます。作業者は、本番用の段階 B の前に `TODO(iori-cutover)` の箇所を戻します。
- `purge-rehearsal-target` が成功した後に、作業者が Dashboard の token 一覧で計測用の子 token を削除します。`purge-rehearsal-target` が失敗した場合は、同じ入力で再実行するので、成功するまで計測用の子 token を削除しません。5.4 節の envelope の取得は wrangler で行うので、計測用の子 token を使いません。計測用 generation のリソースと state は、5.x 節の後片付けに従って扱います。

未作成の bucket を対象にする token は、`IORI_TRANSFER_R2_WRITE` の 1 つだけです。残りの 3 つは、`prepare-target` が bucket を作った後に作ります。この順序にすると、作成した直後の値で S3 の疎通を確かめられます。GitHub は secret の値を返さないので、登録した後には確かめられません。

**準備**

1. 作業者とユーザーが Dashboard で、使い捨ての親 token を作ります。
   - 作業者が「Manage account > Account API tokens > Create Token」を開きます。
   - 作業者が、権限に「Account > Account API Tokens > Edit」だけを付けます。API の permission group 名では「Account API Tokens Write」にあたります。
   - 作業者が、対象 account を移行先の account だけにし、TTL を作業当日の終わりまでにします。名前は `iori-<environment>-<generation>-r2-issuer` にします。
   - Cloudflare の仕様により、作成者は Super Administrator か API Token Provisioning の権限を持つ必要があります。作成者は、自分が持つ権限の範囲内でしか token に権限を付けられません。
   - ユーザーが作成ボタンを押し、表示された画面の Copy ボタンで親 token の値をクリップボードに入れます。親 token の値は、ログにも、PR にも、メッセージにも書きません。
   - 段階 A と段階 B を別の日に行う場合は、段階ごとに親 token を作ります。
2. ユーザーが自分の端末の zsh で、次の内容を実行します。作業者は、`<...>` を埋めたこの内容を、ファイルとして用意してもかまいません。
   - zsh は、親 token をクリップボードから読み、読んだ直後にクリップボードを空にします。
   - zsh は、親 token が有効かを `GET /accounts/<ACCOUNT_ID>/tokens/verify` で確かめます。Copy に失敗していると、クリップボードには古い内容が残っています。このため、zsh は、まず値が token の形式かを確かめます。形式が合わない場合は、zsh は Cloudflare に値を送らずに止まります。形式が合っても有効でない場合も、zsh は止まります。
   - zsh は、`GET /accounts/<ACCOUNT_ID>/tokens/permission_groups` で、`ITEM_WRITE` と `ITEM_READ` の ID が正しい名前に対応しているかを確かめます。Cloudflare は名前が変わりうると説明しているので、policy には ID を指定します。2026-10-31 時点の ID は次のとおりです。
     - Workers R2 Storage Bucket Item Write: `2efd5506f9c8494dacb1fa10a3e7d5b6`
     - Workers R2 Storage Bucket Item Read: `6a018a9f2fc74eb6b293b0c548f38b39`
   - 親 token は `curl --config -` の標準入力で渡すので、コマンドラインの引数には出ません。子 token の値は端末に表示せず、`gh secret set` の標準入力へ渡します。Secret Access Key は、子 token の値の SHA-256 を 16 進の小文字で表した値です。

   ```zsh
   setopt interactive_comments
   CF_ISSUER_TOKEN=$(pbpaste); pbcopy </dev/null
   ACCOUNT_ID='<ACCOUNT_ID>'
   ENV_NAME='<environment>'
   GENERATION='<generation>'
   EXPIRES_ON='<本番用は cutover-route の完了予定日 + 14 日、計測用は計測2 の予定日 + 7 日（RFC 3339）>'
   ITEM_WRITE='2efd5506f9c8494dacb1fa10a3e7d5b6'
   ITEM_READ='6a018a9f2fc74eb6b293b0c548f38b39'
   PREFIX="iori-${ENV_NAME}-${GENERATION}"
   TRANSFER_BUCKET="${PREFIX}-transfer"
   UPLOADS_BUCKET="${PREFIX}-uploads"

   cf_api() {  # $1=method $2=account 配下の path $3=JSON 本文（省略可）
     local -a data
     [[ -n $3 ]] && data=(--data "$3")
     curl -sS -X "$1" "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}$2" \
       -H 'Content-Type: application/json' "${data[@]}" \
       --config - <<<"header = \"Authorization: Bearer ${CF_ISSUER_TOKEN}\""
   }

   if [[ ! $CF_ISSUER_TOKEN =~ '^[A-Za-z0-9_-]{30,}$' ]]; then
     echo 'クリップボードの内容が token の形式ではありません。Copy からやり直します'; unset CF_ISSUER_TOKEN
   elif ! cf_api GET /tokens/verify | jq -e '.success and .result.status == "active"' >/dev/null; then
     echo '親 token が有効ではありません。Copy からやり直します'; unset CF_ISSUER_TOKEN
   elif ! cf_api GET /tokens/permission_groups | jq -e --arg w "$ITEM_WRITE" --arg r "$ITEM_READ" '
       ([.result[] | select(.id == $w) | .name] == ["Workers R2 Storage Bucket Item Write"])
       and ([.result[] | select(.id == $r) | .name] == ["Workers R2 Storage Bucket Item Read"])' >/dev/null; then
     echo 'permission group の ID と名前が対応していません。レビューに戻します'; unset CF_ISSUER_TOKEN
   fi

   issue_r2() {  # $1=secret prefix $2=bucket 名 $3=permission group ID $4=token 名 $5=期限（空なら期限なし）
     setopt local_options pipe_fail
     unset LAST_KEY_ID LAST_SECRET
     [[ -n $CF_ISSUER_TOKEN ]] || { echo '親 token がありません'; return 1; }
     local list body res id
     list=$(cf_api GET '/tokens?per_page=100') || return 1
     if ! jq -e '.success' >/dev/null <<<"$list"; then
       jq -c '.errors' <<<"$list"; return 1
     fi
     if jq -e --arg n "$4" '.result[] | select(.name == $n)' >/dev/null <<<"$list"; then
       echo "$4 は既にあります。既存の token を確かめるまで作り直しません"; return 1
     fi
     body=$(jq -n --arg n "$4" --arg g "$3" --arg e "$5" \
       --arg r "com.cloudflare.edge.r2.bucket.${ACCOUNT_ID}_default_$2" \
       '{name:$n,policies:[{effect:"allow",permission_groups:[{id:$g}],resources:{($r):"*"}}]}
        + (if $e == "" then {} else {expires_on:$e} end)')
     res=$(cf_api POST /tokens "$body") || return 1
     if ! jq -e '.success and (.result.id | type == "string")
                 and (.result.value | type == "string" and length > 0)' >/dev/null <<<"$res"; then
       jq -c '.errors' <<<"$res"; return 1
     fi
     id=$(jq -r '.result.id' <<<"$res")
     local key_id=$id secret
     secret=$(jq -j '.result.value' <<<"$res" | shasum -a 256 | cut -d' ' -f1)
     unset res
     if ! { printf '%s' "$key_id" | gh secret set "$1_ACCESS_KEY_ID" --env "$ENV_NAME" --repo iwasa-kosui/monorepo &&
            printf '%s' "$secret" | gh secret set "$1_SECRET_ACCESS_KEY" --env "$ENV_NAME" --repo iwasa-kosui/monorepo; }; then
       echo "$1 の登録に失敗しました。作った子 token を削除します。$1 の secret は不整合なので、issue_r2 をやり直すまで次の operation を実行しません"
       cf_api DELETE "/tokens/${id}" | jq -c '{success, errors}'
       return 1
     fi
     LAST_KEY_ID=$key_id
     LAST_SECRET=$secret
   }

   s3() {  # $1=method $2=bucket と key（query を含めてよい）。直前に作った credential で呼び、HTTP status だけを表示します
     [[ -n $LAST_KEY_ID && -n $LAST_SECRET ]] || { echo '直前の issue_r2 が成功していません'; return 1; }
     local -a body
     [[ $1 == PUT ]] && body=(--data-binary ok)
     curl -sS -o /dev/null -w '%{http_code}\n' -X "$1" "${body[@]}" --aws-sigv4 'aws:amz:auto:s3' \
       "https://${ACCOUNT_ID}.r2.cloudflarestorage.com/$2" \
       --config - <<<"user = \"${LAST_KEY_ID}:${LAST_SECRET}\""
   }
   ```

   `issue_r2` は、失敗したときに `errors` だけを表示します。成功したときは何も表示しません。`issue_r2` は、呼ばれるたびに直前の credential を消してから作業します。このため、`issue_r2` が失敗した後の `s3` は、前の token で疎通を確かめずに失敗します。途中で作業を止めた場合は、ユーザーが `unset CF_ISSUER_TOKEN LAST_KEY_ID LAST_SECRET` を実行するか、シェルを閉じます。

**段階 A: `prepare-target` の前**

1. ユーザーが、手順 2 の zsh を読み込んだ端末で `IORI_TRANSFER_R2_WRITE` を作ります。

   ```zsh
   issue_r2 IORI_TRANSFER_R2_WRITE "$TRANSFER_BUCKET" "$ITEM_WRITE" "${PREFIX}-transfer-write" "$EXPIRES_ON"
   unset LAST_KEY_ID LAST_SECRET CF_ISSUER_TOKEN
   ```

2. 作業者が Dashboard の token 一覧で親 token を削除し、一覧から消えたことを確認します。
3. `prepare-target` が準備記録を transfer bucket に書き込んで読み戻すと、`IORI_TRANSFER_R2_WRITE` の疎通が確かめられます。

**段階 B: `prepare-target` の後、`rehearse-migration` と `migrate-data` の前**

1. 作業者とユーザーが「準備」の手順 1 で新しい親 token を作ります。ユーザーが手順 2 の zsh を読み込み直し、残りの 3 つを作ります。各 token を作った直後に、作った値で S3 の疎通を確かめます。読み取り専用の token では、書き込みが 403 で拒否されることも確かめます。

   ```zsh
   issue_r2 IORI_TRANSFER_R2_READ_ONLY "$TRANSFER_BUCKET" "$ITEM_READ" "${PREFIX}-transfer-read-only" '' &&
     s3 GET "${TRANSFER_BUCKET}/prepared-target/v1/${ENV_NAME}/${GENERATION}/record.json" &&  # 200
     s3 PUT "${TRANSFER_BUCKET}/connectivity-check/${GENERATION}"                              # 403

   issue_r2 IORI_APPLICATION_R2_WRITE "$UPLOADS_BUCKET" "$ITEM_WRITE" "${PREFIX}-application-write" "$EXPIRES_ON" &&
     s3 PUT "${UPLOADS_BUCKET}/connectivity-check/${GENERATION}" &&     # 200
     s3 GET "${UPLOADS_BUCKET}?list-type=2" &&                          # 200
     s3 DELETE "${UPLOADS_BUCKET}/connectivity-check/${GENERATION}"     # 204

   issue_r2 IORI_APPLICATION_R2_READ_ONLY "$UPLOADS_BUCKET" "$ITEM_READ" "${PREFIX}-application-read-only" "$EXPIRES_ON" &&
     s3 GET "${UPLOADS_BUCKET}?list-type=2&prefix=og/" &&               # 200
     s3 PUT "${UPLOADS_BUCKET}/connectivity-check/${GENERATION}"        # 403

   unset LAST_KEY_ID LAST_SECRET CF_ISSUER_TOKEN
   ```

   `IORI_APPLICATION_R2_WRITE` のブロックにある `s3 GET "${UPLOADS_BUCKET}?list-type=2"` は、ListObjectsV2 の疎通確認です。`purge-rehearsal-target` が使う ListObjectsV2 を、実行前に確かめます。計測では、`UPLOADS_BUCKET` が使い捨て generation の uploads bucket を指します。`s3` 関数は DeleteObjects の本文を送れないので、このブロックは DeleteObjects を確かめません。

2. 作業者が `gh api repos/iwasa-kosui/monorepo/environments/<environment>/secrets` で、8 つの secret 名と更新日時を確認します。値は読みません。
3. 作業者が Dashboard の token 一覧で親 token を削除し、一覧から消えたことを確認します。

**完了条件:** 段階 B の `s3` がすべて期待した status を返し、8 つの secret（計測では 6 つ）が登録されていることです。この条件を満たすまで、`rehearse-migration` と `migrate-data` を実行しません。

- 読み取り専用の token への PUT が 403 以外を返した場合は、作業者がその子 token を Dashboard の token 一覧ですぐに削除し、レビューに戻します。
- `connectivity-check/` の DELETE が失敗した場合は、残った object を移行後の後始末で削除します。`verify-import` が列挙するのは `post-images/` と `og/` だけなので、残った object は後続の検査に影響しません。
- `migrate-data` を始める前に、作業者が Dashboard の token 一覧で、期限のある子 token（本番用では 3 つ、計測用では 2 つ）の期限を確かめます。期限まで 3 日を切っている子 token がある場合は、Dashboard で期限を延ばしません。延ばした後に token の値が変わらないことを確かめていないからです。代わりに、作業者が Dashboard でその子 token を削除し、ユーザーが新しい親 token で `issue_r2` を実行して作り直します。作り直した後は、段階 B と同じ `s3` で疎通を確かめます。`transfer-write` を作り直した場合は、`s3 GET` で準備記録を読めることを確かめます。

**移行後の後始末**

- 本番用 generation の `cutover-route` の完了を確認した後に、作業者が Dashboard の token 一覧で `transfer-write`、`application-write`、`application-read-only` の子 token を削除します。期限は削除を忘れた場合の備えです。
- `transfer-read-only` の子 token は、その generation が active な間は削除しません。
- 作業者が Dashboard の R2 の object 一覧で、application bucket と transfer bucket の `connectivity-check/` に object が残っていないかを確かめます。object が残っていれば、作業者が Dashboard で削除します。読み取り専用の token への PUT が 403 にならなかった場合に書き込まれた object も、同じ prefix にあります。作業者は、その object も同じ方法で削除します。
- 切り替え後に transfer bucket の移行 bundle（準備記録以外）をいつ、どう削除するかは、[#498](https://github.com/iwasa-kosui/monorepo/issues/498) で決めます。

**未確認の点と、止める条件**

- 未作成の bucket 名を resource に指定できるかどうかは、Cloudflare の文書に記載がありません。段階 A の API がエラーを返した場合は、その時点で作業を止めて、レビューに戻します。代わりに bucket を手動で作ってはいけません。
- account token から S3 credential を導出する方法は、R2 の文書では user token を例に説明されています。`prepare-target` が準備記録の書き込みで認証エラーになった場合は、[中断と引き継ぎ](#7-中断と引き継ぎ)の「準備の結果が不明」の行に従います。同じ generation で `prepare-target` を再実行しません。
- `s3` 関数（curl の `--aws-sigv4`）は、この小節を書いた時点では実行していません。段階 B で書き込み用の token にも 403 が返った場合は、token の権限ではなく署名の作り方が原因の可能性があります。その場合は、作業者がその子 token を削除して、レビューに戻します。

**根拠**

- [R2 の API token](https://developers.cloudflare.com/r2/api/tokens/): permission group、resource の書式、S3 credential の導出
- [API 経由の token 作成](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/): account token の作成 API と、親 token に必要な権限
- [account 所有の token](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/): 作成者に必要な権限

### 3.2 登録する参照名

値は GitHub の **Settings → Environments → 対象 Environment → Environment secrets** へ登録します。下表の prefix はそれぞれ `_ACCESS_KEY_ID` と `_SECRET_ACCESS_KEY` の2件です。全35名を網羅しています。

| 用途            | Secret 名または prefix                                                                                                                                                                | 値の準備元                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 移行先          | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `IORI_TERRAFORM_BACKEND_BUCKET`, `ORIGIN`                                                                                              | 確認済み account・zone・独立 backend・canonical origin                                                                             |
| 実行 identity   | `IORI_ADMISSION_IDENTITY`                                                                                                                                                             | 次項の同じ environment/generation/SHA/run と smoke 対象                                                                            |
| API role        | `IORI_CLOUDFLARE_PREPARE_API_TOKEN`, `IORI_CLOUDFLARE_MIGRATE_API_TOKEN`, `IORI_CLOUDFLARE_VERIFY_API_TOKEN`, `IORI_CLOUDFLARE_CUTOVER_API_TOKEN`, `IORI_CLOUDFLARE_DEPLOY_API_TOKEN` | 第3.1節の用途別 token                                                                                                              |
| State S3        | `IORI_TERRAFORM_WRITE`, `IORI_TERRAFORM_READ_ONLY`                                                                                                                                    | Backend bucket に限定した2組                                                                                                       |
| Transfer S3     | `IORI_TRANSFER_R2_WRITE`, `IORI_TRANSFER_R2_READ_ONLY`                                                                                                                                | 非公開 bundle bucket に限定した2組                                                                                                 |
| Application S3  | `IORI_APPLICATION_R2_WRITE`, `IORI_APPLICATION_R2_READ_ONLY`                                                                                                                          | 対象 generation の画像 bucket に限定した2組                                                                                        |
| Source SSH      | `IORI_SOURCE_SSH_HOST`, `IORI_SOURCE_SSH_USER`, `IORI_SOURCE_SSH_PRIVATE_KEY`, `IORI_SOURCE_SSH_KNOWN_HOSTS`                                                                          | 許可された source と信頼済み host key                                                                                              |
| 署名            | `IORI_MIGRATION_RECEIPT_PRIVATE_KEY`, `IORI_MIGRATION_RECEIPT_PUBLIC_KEY`, `IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256`                                                                 | Ed25519 秘密鍵、対応する公開鍵 PEM、公開鍵ファイルの SHA-256 pin                                                                   |
| 実測            | `IORI_MIGRATION_REHEARSAL`                                                                                                                                                            | 第5.4節で登録する、`rehearse-migration` が作った profile JSON。ファイル path ではなく内容。`rehearse-migration` の実行には要らない |
| Smoke / staging | `SMOKE_QUEUE_TOKEN`, `STAGING_ACCESS_TOKEN`                                                                                                                                           | 互いに異なる16〜1,024文字のランダム ASCII。`STAGING_ACCESS_TOKEN` が要るのは staging を使う場合だけ                                |
| Web Push        | `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`                                                                                                                              | 既存購読と対応する承認済み VAPID 設定                                                                                              |

`estimate-source` が使う参照名は、Source SSH の4件だけです。`purge-rehearsal-target` が使う参照名は、次のとおりです。Source SSH、署名、実測の参照名は使いません。

- 移行先: `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_ZONE_ID`、`IORI_TERRAFORM_BACKEND_BUCKET`、`ORIGIN`
- 実行 identity: `IORI_ADMISSION_IDENTITY`
- Web Push: `VAPID_SUBJECT`
- API role: `IORI_CLOUDFLARE_MIGRATE_API_TOKEN`
- State S3: `IORI_TERRAFORM_READ_ONLY`
- Transfer S3: `IORI_TRANSFER_R2_READ_ONLY`
- Application S3: `IORI_APPLICATION_R2_WRITE`

既存の `MICROBLOG_*`、`IORI_VAPID_*`、汎用 `CLOUDFLARE_API_TOKEN` は、新しい名前への自動マッピングではありません。VAPID については、下の「[VAPID 値の確認](#vapid-値の確認)」にユーザーの回答と自動の検査を書いています。GitHub API から secret 値を取り出すこともできません。既存の安全な保管元から適合する値を用意します。staging を使う場合は、staging の source SSH を本番へ向けないでください。

### VAPID 値の確認

- 2026-11-01 にユーザーが回答しました。production Environment の旧名 `IORI_VAPID_*` と、repo レベルの `VAPID_*` は同じ鍵です。workflow は repo レベルの `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を受け取ります。
- Worker の満たすべき条件は、現行の Node 版と同じ鍵を使うことです。Node 版は、source サーバーの `/etc/systemd/system/microblog.service.d/env.conf` から VAPID の値を読みます。
- `prepare-target` だけが Worker に VAPID の値を設定します。同じ generation では、リソースを作り始めた後の `prepare-target` を再実行できません。
- このため、`prepare-target` は Cloudflare のリソースを作る前に、次の検査を自動で行います（`scripts/vapid-origin-check.mjs`）。
  - `VAPID_PRIVATE_KEY` から導いた公開鍵が、`VAPID_PUBLIC_KEY` と一致すること。2 つの鍵は、パディングなしの base64url でなければなりません。Worker の Web Push の実装も、パディングなしの base64url しか受け付けません。
  - staging 以外の environment（今回の移行では production）で、`ORIGIN` の `/api/v1/push/vapid-public-key` が返す `publicKey` が、`VAPID_PUBLIC_KEY` と一致すること。staging を使う場合、staging には `prepare-target` の時点で応答するアプリがないので、staging ではこの照合を行いません。
- 検査の結果（`VAPID key pair match` と `Origin VAPID public key match` の `yes`、`no`、`skipped`）と、失敗時の文言は、runner の private ログにだけ記録されます。private ログは job の終わりに削除されるので、作業者は後から読めません。Actions の公開ログには、`IORI_DIAG` 行の `reason` と固定の文言で、失敗の種類が出ます。公開ログに `IORI_DIAG stage=prepare-<段>` の行がある場合、作業者は下の「[prepare-target の失敗した段](#prepare-target-の失敗した段)」の表で、止まった段を先に確かめます。
  - `prepare-target` がリソースを作る前に止まった場合、子プロセスは終了コード 78 で終わります。公開ログには `IORI_DIAG stage=hosted-operation program=node exit=78 signal=none reason=stopped-before-resources` と、「Target preparation stopped before creating resources; fix the inputs and rerun with the same generation.」が出ます。後者は private ログにある子プロセスの文言と同じです。
  - `prepare-target` がリソースを作り始める段階に入った後に失敗した場合、子プロセスは終了コード 1 で終わります。この段階に入っても、リソースが作られたとは限りません。公開ログには `IORI_DIAG stage=hosted-operation program=node exit=1 signal=none reason=command-failed` と、「Protected workflow step failed; retain remote state for reviewed recovery.」が出ます。
- 公開ログに `reason=stopped-before-resources` が出ている場合、`prepare-target` はリソースを作る前に止まっています。リソースは作られていないので、作業者は Dashboard を確かめずに、同じ generation で再実行してよいです。原因は private ログにしか残らないため、作業者は次の順に確かめます。
  1. `IORI_ENVIRONMENT` などの入力が正しいか確かめます。
  2. 必須の secret が揃っているか確かめます。必須の secret は `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`、`SMOKE_QUEUE_TOKEN` です。staging を使う場合は、`STAGING_ACCESS_TOKEN` も必須です。この場合は、`STAGING_ACCESS_TOKEN` と `SMOKE_QUEUE_TOKEN` が別の値であることも確かめます。
  3. VAPID の値を確かめます。VAPID の検査で止まった可能性があるので、作業者は次の順に対応します。
     1. ユーザーが source サーバーの `env.conf` の `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を、production Environment の secret として標準入力で登録します。鍵は、末尾の `=` と改行を除いた base64url の値で登録します。パディングや改行が残っていると、同じ検査で再び失敗します。Environment secret は、同じ名前の repo レベル secret より優先されます。
     2. 作業者が同じ generation で `prepare-target` をやり直します。
     3. やり直しても失敗し、リソースも作られていない場合は、GitHub hosted runner から `ORIGIN` に到達できない可能性があります。この場合は作業を止めて、レビューに戻します。
- 公開ログに `reason=command-failed` が出ている場合、`prepare-target` はリソースを作り始める段階に入った後に失敗しています。この段階に入っても、リソースが作られたとは限りません。`prepare-target` は、最初の処理として、この generation の名前のリソースが無いことを読み取りだけで確かめます（`assertFresh`）。この読み取りの失敗でも、終了コード 1 で終わります。作業者は Dashboard で Worker `iori-<environment>-<generation>` と、その generation の D1、KV、Queue、R2 bucket の有無を確かめます。
  - どれも存在しない場合は、リソースが作られる前に失敗しています。`assertFresh` の読み取りが失敗した可能性があります。`assertFresh` は、Cloudflare API の応答が失敗した場合、応答の形式が想定と違う場合、一覧が 100 件以上ある場合に失敗します。リソースが無くても、apply の段階で state が書かれた可能性があります。作業者は、Dashboard の R2 で backend bucket（`IORI_TERRAFORM_BACKEND_BUCKET`）を開き、`iori/<environment>/<generation>/` の下に object（`terraform.tfstate` とロック用の `terraform.tfstate.tflock`）が無いかを確かめます。
    - object が1つも無い場合、作業者は同じ generation で再実行してよいです。
    - object が1つでもある場合、作業者は同じ generation で再実行せず、作業を止めて、Dashboard の確認結果を添えてレビューに戻します。
  - どれか 1 つでも存在する場合は、リソースを作り始めた後に失敗しているか、その generation がすでに使われています。`assertFresh` は、同じ名前のリソースを 1 つでも見つけると失敗するためです。この場合は、[中断と引き継ぎ](#7-中断と引き継ぎ)の「準備の結果が不明」の行に従います。
- 旧名の `IORI_VAPID_*` と variable `IORI_VAPID_SUBJECT` は、切り替えが終わるまで削除しません。

CLI で1件ずつ登録する場合は、値を command argument にせず、承認済みの mode `0600` ファイルを標準入力に渡します。これは登録例であり、全値を自動生成するコマンドではありません。

```bash
gh secret set IORI_MIGRATION_RECEIPT_PUBLIC_KEY \
  --repo "$iori_repo" --env "$iori_environment" \
  < "$iori_ops_dir/receipt-public.pem"
gh secret list --repo "$iori_repo" --env "$iori_environment"
```

### prepare-target の失敗した段

`prepare-target` が失敗すると、子プロセスは `hosted-operation` の行より前に、止まった段を示す `IORI_DIAG` の行を1行出します。終了コードと `hosted-operation` の行は変わりません。

```text
IORI_DIAG stage=prepare-<段> program=none exit=none signal=none reason=<分類>
```

公開ログに出るのは固定の語彙と数だけです。URL、ID、応答の本文、例外の文言は出ません。作業者は `stage` で止まった段を、`reason` で原因の種別を見分けます。

`stage` の語彙と、段ごとに同じ generation でやり直せるかどうかは、次のとおりです。

| `stage`                   | 処理                                                                                                                                     | 同じ generation でやり直せるか                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare-inputs`          | 設定と必須 secret の検査                                                                                                                 | 終了コードは 78 です。リソースは作られていません。作業者は入力を直して、同じ generation でやり直せます                                                                                                                                                               |
| `prepare-vapid`           | VAPID 値の検査                                                                                                                           | 終了コードは 78 です。リソースは作られていません。作業者は入力を直して、同じ generation でやり直せます                                                                                                                                                               |
| `prepare-setup`           | transfer storage と作業ディレクトリの準備、Cloudflare API の token と Terraform の設定の検査                                             | 終了コードは 78 です。リソースは作られていません。作業者は入力を直して、同じ generation でやり直せます                                                                                                                                                               |
| `prepare-fresh-check`     | Cloudflare API でリソースが無いことを確かめる読み取り                                                                                    | 終了コードは 1 です。読み取りだけなので、リソースも state も作られていません。`-exists` 以外は、作業者は原因を直して同じ generation でやり直せます。`-exists` は同じ名前のリソースが既にあるので、作業者は同じ generation では進めず、既存のリソースをレビューします |
| `prepare-tf-init`         | Terraform の backend の初期化                                                                                                            | 終了コードは 1 です。リソースは作られていません。作業者は上で説明した手順で backend bucket の object を確かめ、1つも無ければ同じ generation でやり直せます                                                                                                           |
| `prepare-tf-show`         | state が空であることの確認                                                                                                               | `reason` が `state-present` のときは、state が既にあるので、作業者は同じ generation では進めずレビューします。それ以外は、`prepare-tf-init` と同じ判断です                                                                                                           |
| `prepare-tf-plan`         | リソースの plan と検査。plan を拒否したときは、`reason=plan-rejected` の行の前に、拒否した resource と action を示す行を最大8行出します  | リソースは作られていません。作業者は `prepare-tf-init` と同じ判断をします                                                                                                                                                                                            |
| `prepare-tf-apply`        | リソースの apply と出力の突合                                                                                                            | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-resource-read`   | 作ったリソースの読み取り                                                                                                                 | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-deploy`          | sealed の Worker の配備                                                                                                                  | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-deploy-read`     | deploy の後の Queue の一時停止の読み直し                                                                                                 | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-attach`          | Worker が sealed で配備されたことの確認                                                                                                  | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-attach-tf-plan`  | consumer の plan と検査。plan を拒否したときは、`reason=plan-rejected` の行の前に、拒否した resource と action を示す行を最大8行出します | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-attach-tf-apply` | consumer の apply                                                                                                                        | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-attach-read`     | consumer を付けた後の読み取り                                                                                                            | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-readback`        | Terraform の出力と読み取った状態の突合                                                                                                   | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-record`          | 準備の記録の書き込み                                                                                                                     | リソースが一部できている可能性があります。作業者は同じ generation でやり直さず、generation と記録を残してレビューします                                                                                                                                              |
| `prepare-unclassified`    | 段が分からない                                                                                                                           | 終了コード 1 として扱います。作業者は上で説明した backend bucket の確認手順で判断します                                                                                                                                                                              |

`prepare-deploy-read` は、Worker を deploy した後に Queue の配送が一時停止のままかを Queue API で読み直します。wrangler 4.29.0 より前の版は、queue の producer を持つ Worker を deploy するたびに Queue の設定を置き換え、一時停止を解除していました。この変更は wrangler 4.29.0 の CHANGELOG（[cloudflare/workers-sdk#10288](https://github.com/cloudflare/workers-sdk/pull/10288)、[CHANGELOG](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/CHANGELOG.md)）に記載されています。apps/iori は 4.72.0 を使います。この段は、同じ解除が再び起きたときに、Terraform の plan より前に止めるために置いています。wrangler 4.72.0 でも、wrangler の設定に queue の consumers を足すと、deploy が consumer の設定を PUT で置き換えるので、一時停止が解除される可能性があります。`prepare-deploy-read` は、この場合の解除も検出します。

Cloudflare API の読み取りが失敗したときの `reason` は、`<api>-<種別>` の形です。`<api>` は読み取りの対象を、`<種別>` は失敗の種類を表します。

| `<api>`   | 対象                                                          |
| --------- | ------------------------------------------------------------- |
| `workers` | Worker の一覧と、Worker の配備・version・subdomain の読み取り |
| `d1`      | D1                                                            |
| `kv`      | KV                                                            |
| `queues`  | Queue                                                         |
| `r2`      | R2                                                            |
| `zones`   | Zone の route                                                 |
| `other`   | 上のどれにも当たらない読み取り                                |

| `<種別>`        | 意味                                                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http-<status>` | API が成功以外の HTTP status を返しました。status は数だけ出ます。たとえば `workers-http-403` は、Worker の一覧の読み取りが 403 を返したことを示します。403 なら token の権限を、5xx なら一時的な失敗を疑います                                                                                                                   |
| `request`       | 通信の失敗、30 秒の timeout、redirect のどれかです                                                                                                                                                                                                                                                                                |
| `too-large`     | 応答が 2,000,000 byte を超えました                                                                                                                                                                                                                                                                                                |
| `shape`         | 応答の形が想定と違います。R2 の bucket の一覧は、`result_info` と、その中の `cursor`、`per_page`、`total_count` が無くても通ります                                                                                                                                                                                                |
| `limit`         | 一覧が 100 件以上あるか、続きのページがあります。この確認は1ページで全件を見る前提なので、作業者が件数を減らすか確認の方法を見直すまで、同じ generation でも通りません。R2 の bucket の一覧は、応答に 1ページの件数（`per_page`）が無いときは 20 件以上、件数の合計（`total_count`）が返した件数より多いときも `limit` になります |
| `exists`        | generation の名前のリソースが既にあります。`prepare-fresh-check` だけで出ます                                                                                                                                                                                                                                                     |

`prepare-fresh-check` 以外の段で Cloudflare の読み取りが期待と違ったときは `state-mismatch` が、Worker が sealed でないときは `not-sealed` が `reason` に出ます。`reason` が `state-mismatch` のときは、外れた条件を示す `resource-` で始まる行が、`state-mismatch` の行の前に出ます。

準備で配備した Worker の状態の読み取り（`prepare-attach` など）が期待と違ったときは、`state-mismatch` の代わりに次の `reason` が出ます。

| `reason`                  | 意味                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `worker-input`            | Worker の読み取りに渡した入力（admission の値、zone、version）が正しくありません                                       |
| `worker-resources`        | 読み取ったリソースの状態が、Queue の一時停止を含めて期待と違います                                                     |
| `worker-deployment`       | 最新の deployment が、配備した version を 100% で1つだけ持っていません                                                 |
| `worker-version`          | 読み取った version が、配備した version と違います                                                                     |
| `worker-subdomain`        | workers.dev が無効か、preview が有効です                                                                               |
| `worker-route`            | この Worker の route の数か pattern が期待と違います                                                                   |
| `worker-bindings-shape`   | binding の一覧が無いか、名前が重複しています                                                                           |
| `worker-binding-missing`  | 期待する binding（D1、R2、KV、Queue、assets、admission の値、ORIGIN）がありません                                      |
| `worker-binding-mismatch` | 期待する名前の binding の種類か値が違います                                                                            |
| `worker-binding-extra`    | 期待しない binding があります。production の Worker に `STAGING_ACCESS_TOKEN` があると、この `reason` になります       |
| `worker-secret-missing`   | 必須の secret（VAPID の鍵と smoke の token。staging では `STAGING_ACCESS_TOKEN` も）が secret として登録されていません |

`reason` のその他の語彙は、次のとおりです。

| `reason`                   | 意味                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `config-invalid`           | 設定、token、Terraform の入力が不正です                                                                                              |
| `credentials-missing`      | 必須の secret がありません                                                                                                           |
| `credential-not-distinct`  | staging の access token が smoke の token と同じです                                                                                 |
| `vapid-rejected`           | VAPID 値の検査で失敗しました                                                                                                         |
| `command-failed`           | terraform または Worker の配備コマンドが失敗しました。出力は private のログにだけ残ります                                            |
| `state-present`            | Terraform の state が既にあります                                                                                                    |
| `plan-rejected`            | plan に想定外の変更が含まれています。拒否の詳細は、この行の前に出る `plan-` で始まる行で示します。                                   |
| `queue-not-paused`         | deploy の後か Worker の切り替えの後に、Queue の配送が一時停止ではありません。                                                        |
| `plan-<resource>-<action>` | `plan-rejected` の行の前に出る詳細の行です。Terraform の plan が `<resource>` に対して `<action>` を含んでいたために拒否されました。 |
| `plan-invalid`             | 詳細の行です。plan の形が不正か、特定の resource に結び付かない検査で拒否されました。                                                |
| `plan-bindings-changed`    | 詳細の行です。plan の前後で Worker の binding の出力が変わるために拒否されました。                                                   |
| `output-invalid`           | Terraform の出力が読めません                                                                                                         |
| `output-mismatch`          | Terraform の出力が想定と違います                                                                                                     |
| `result-invalid`           | Worker の配備結果が読めません                                                                                                        |
| `identity-mismatch`        | 配備した Worker の名前が想定と違います                                                                                               |
| `mismatch`                 | 準備後の読み取りと Terraform の出力が合いません                                                                                      |
| `aborted`                  | 中断または timeout です                                                                                                              |
| `unclassified`             | 上のどれにも当たりません                                                                                                             |

`<resource>` は `d1`、`uploads`、`kv`、`queue`、`dlq`、`transfer`、`transfer-domain`、`consumer`、`route`、`other` のどれかです。`<action>` は `create`、`update`、`delete`、`replace`、`no-op`、`other` のどれかです。例として、`plan-queue-update` は fedify の Queue の更新を表します。

リソースの読み取り（`prepare-resource-read`、`prepare-attach-read`、`cutover-gate-smoke`、`cutover-gate-route`、`cutover-gate-active`、`cutover-gate-queue`、`cutover-read-resume`）が `state-mismatch` で止まったときは、外れた条件ごとに次の語の行が最大8行出ます。

| `reason`                     | 意味                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `resource-input`             | 読み取りに渡したリソースの ID の形が不正か、Queue と DLQ の ID が同じです。            |
| `resource-d1`                | D1 の uuid か名前が一致しません。                                                      |
| `resource-kv`                | KV の ID か title が一致しません。                                                     |
| `resource-r2`                | uploads か transfer の bucket の名前が一致しません。                                   |
| `resource-queue-identity`    | Queue か DLQ の ID か名前が一致しません。                                              |
| `resource-queue-paused`      | Queue か DLQ の配送の一時停止の状態が期待と違います。                                  |
| `resource-queue-shape`       | Queue の応答の consumers、producers、件数の形が不正です。                              |
| `resource-queue-created`     | Queue の作成日時が無いか、日時の形ではありません。                                     |
| `resource-dlq-attached`      | DLQ に consumer か producer があります。                                               |
| `resource-consumer-count`    | Queue の consumer の件数が期待と違います。                                             |
| `resource-producer`          | Queue に、自分の Worker 以外の producer があります。                                   |
| `resource-consumer-type`     | consumer の種別が Worker ではありません。                                              |
| `resource-consumer-script`   | consumer の Worker 名が自分の Worker と一致しません。                                  |
| `resource-consumer-dlq`      | consumer の DLQ の名前が一致しません。                                                 |
| `resource-consumer-id`       | consumer の ID が無いか、形が不正です。                                                |
| `resource-consumer-settings` | consumer の batch size、待ち時間、再試行の回数、再試行の間隔のどれかが期待と違います。 |
| `resource-domain-public`     | transfer の bucket の r2.dev の公開 URL が無効になっていません。                       |

Cloudflare Queues API は、consumer の Worker 名を `script` で返します。Terraform の provider の定義は `script_name` と書いていますが、2026-11-01 の読み取りでは、`GET /queues/{queue_id}` の応答の consumer に `script_name` はありませんでした。読み取りは `script` を使い、`script` が無いときだけ `script_name` を使います。2026-11-01 の `GET /queues/{queue_id}` の読み取りでは、次のキーを確かめました。`result` は `queue_id`、`queue_name`、`settings`、`created_on`、`modified_on`、`producers_total_count`、`producers`、`consumers_total_count`、`consumers` を持ちます。`result.settings` は `delivery_delay`、`delivery_paused`、`message_retention_period` を持ちます。`result.consumers[]` の要素は `script`、`dead_letter_queue`、`settings`、`consumer_id`、`type` を持ち、`dead_letter_queue` は DLQ の名前です。consumer の `settings` は `batch_size`、`max_retries`、`max_wait_time_ms`、`retry_delay` を持ちます。`result.producers[]` の要素は `script` と `type` を持ちます。Dashboard が表示する HTTP Push の producer は、API の `producers` には入っていません。

### 3.3 Identity の照合

`IORI_ADMISSION_IDENTITY` は JSON 内容を登録します。値は実データ・実リソースから選び、次の対応を検査します。

| JSON field                                                  | 対応する値                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `environment`, `generation`, `runId`                        | workflow の `environment`, `generation`, `migration_run_id`                   |
| `mainSha`                                                   | 移行に使うレビュー済み最新 main の40桁 SHA                                    |
| `hostname`                                                  | `ORIGIN` の canonical hostname                                                |
| `workerHostname`                                            | 新 generation の確認済み workers.dev hostname                                 |
| `smoke.username`, `smoke.uploadFilename`, `smoke.articleId` | 移行対象に存在し、完全な smoke checklist を実行できるユーザー・画像・公開記事 |

smoke は、`smoke.articleId` の記事の OGP PNG が R2 に backfill 済みであることを前提とします。smoke は Worker の OGP 生成の経路を検証しません。作業者は、その経路を第6.2節の「production 切替後の OGP 確認」で確かめます。

fixture のゼロ UUID や仮の hostname を本番へ登録しません。初回準備後は identity を同じ migration の途中で差し替えません。詳細な独立 target と prepared record の照合は [infra README](../../infra/cloudflare/README.md)に従います。

**完了条件:** 参照名、対象、権限、鍵の対応、identity が揃う。実測 profile は第5節で `rehearse-migration` を実行した後に登録する。各 role の実接続が検証できるまで credential 名だけで pass にしない。

## 4. Source の診断と事前配備

作業者は旧環境に直接入りません。作業者は、確認したい項目を管理役に伝えます。作業者は、CI（GitHub Actions）の operation `diagnose-source` で旧環境の状態を読みます。管理役の指示を受けた作業者が `diagnose-source` を dispatch し、production Environment の required reviewer が実行を承認します。`diagnose-source` の手順と出力項目は[第7.2節](#72-旧環境の状態を読み取る)に書いてあります。`diagnose-source` が成功すれば、hosted runner から旧環境へ SSH で接続できたことも分かります。ただし、この成功は source が移行可能であることを証明しません。

作業者は、読み取った値を非公開で記録します。未確認・不一致を見つけたら、修正内容を具体化して事前配備より前に解消します。下表の「操作・対象」列に `diagnose-source` の項目名を書いた行は、その項目で確認します。Checkout、Runtime、Package manager、Private control の4行は、`diagnose-source` の出力に対応する値がありません。この4項目を確認できる operation は現在ありません。作業者は、この4項目が未確認であることを管理役に伝えます。管理役は、operation を追加するか、確認を省くかを判断します。

| 確認            | 操作・対象                                                                                                                                                                  | 完了条件                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 稼働状態        | `diagnose-source` の `active` と `sub`（`systemctl show microblog` の `ActiveState` と `SubState`）                                                                         | `active`。停止を drain の証拠にしない                                            |
| Checkout        | `$HOME/monorepo` の revision と tracked 変更                                                                                                                                | 配備前の revision を記録。変更があれば保持方針を決める                           |
| Runtime         | `$HOME/.nvm/versions/node/v24.12.0/bin/node`                                                                                                                                | 実体・所有者・実行権限・安全な mode を確認し、version が `v24.12.0`              |
| Package manager | `$HOME/.local/share/pnpm/pnpm`                                                                                                                                              | 同じ metadata 検査を行い、version が `10.12.4`。symlink を別実体へ自動追従しない |
| 凍結            | `diagnose-source` の `freeze`（`$HOME/.iori-migration/freeze.json`）と `freeze_pending`（`freeze.pending`）                                                                 | 両方の有無を確認。存在したら再配備・再起動せず、その run の復旧判断へ進む        |
| Private control | `.iori-migration` の mode、owner、`control.sock`、control CLI                                                                                                               | 同じ service user、所定の private 配置。初回未配備ならその事実を記録             |
| 容量            | source export 先と runner の空き容量、実データ量。export 先が home と同じファイルシステムにある場合は、export 先の空き容量を `diagnose-source` の `disk_free_mb` で確認する | [容量・時間の条件](./cloudflare-data-migration.md)を満たす                       |

本番 source の事前配備は、環境保護・固定 runtime・既存 DB/TLS 設定の保持・最新 main のレビューと明示承認が揃ってから `deploy-iori.yml` で行います。配備は env.conf の `UPLOAD_DIR` が dist の外にある既存のディレクトリを指していることを確認し、満たさなければ止まります。merge で同じ SHA の source job が起動済みなら、それを確認し、重複 dispatch しません。DB schema の push はこの事前配備に含みません。

```bash
gh workflow run deploy-iori.yml --repo "$iori_repo" --ref main
```

この workflow は入力なしで **production 固定の配備** を行います。診断コマンドでも、staging source の構築入口でもありません。別途準備する匿名化 source にこの workflow を流用しません。

`deploy-iori.yml` の step「Deploy guarded exact source revision」は、旧環境の再起動の後に `status` 段階を実行します。作業者は旧環境に直接入らないので、旧環境で `source-control.mjs` を実行しません。作業者は、この step が成功したことを確認します。step が失敗した場合、作業者は[第4.1節](#41-source-配備-step-の失敗診断)の `reason` に従います。

`source-control-client.mjs` は library であり、直接の CLI 入口ではありません。status は既知の SHA/run を渡して照合する操作で、未知の build SHA や既存 freeze の run を探す操作ではありません。既存 marker/socket を作り直して成功させず、status が返す起動中 build SHA と配布 manifest の検証まで確認します。

**完了条件:** 必要な runtime・source control が配備され、build SHA と配布物が一致し、意図しない凍結や dirty checkout がない。hosted runner からの接続も確認する。

### 4.1 source 配備 step の失敗診断

作業者は旧環境に直接入りません。作業者は、旧環境側の確認が要る `reason` を管理役に伝えます。

`deploy-iori.yml` の step「Deploy guarded exact source revision」が失敗すると、step は固定の失敗文言 `Protected workflow step failed; retain remote state for reviewed recovery.` を出します。step はこの文言の直前に、次の形式の診断行を Actions ログへ出します。診断行に秘密値とホスト名は含まれません。

```text
IORI_DIAG stage=<段階> program=<ssh|rsync|node|none> exit=<0-255|none> signal=<名前|none> reason=<分類>
```

配備が成功した場合、step は `IORI_DIAG` 行を出しません。ただし、`remote-configuration-owner` 段階が env.conf の所有者か mode を直したときは、成功した配備でも `IORI_NOTICE` 行を Actions ログへ出します。

`stage` の値と意味は次のとおりです。

- `inputs`: 入力の検査
- `manifest`: runner 側の main と dist の検査
- `remote-check`、`remote-checkout`、`remote-dependencies`、`remote-dist-check`、`remote-verify-dist`、`remote-configuration-owner`、`remote-install`、`remote-restart`: 旧環境で実行する各段階
- `rsync`: dist の転送
- `status`: 再起動後の readiness 確認
- `hosted-invocation`、`hosted-private-directory`、`hosted-materialize`、`hosted-reviewed-main`、`hosted-deploy-source`: runner 側の前処理。まとめて `hosted-*` と呼びます。

旧環境では、`remote-verify-dist` の後、`remote-install` の前に、`remote-configuration-owner` 段階が `/etc/systemd/system/microblog.service.d/env.conf` の所有者を検査します。旧ワークフローは env.conf を `rsync -a` で配置したため、所有者が runner の uid のまま残りました。`remote-install` 段階は root 所有の env.conf だけを受け付けます。この段階は次のように動きます。

- 所有者が root（uid 0）の場合、所有者を変えません。
- 所有者が root でなく、env.conf が通常ファイルで、group と other に書き込み権限がない場合、`sudo -n chown 0:0` で所有者を root に直します。直したときだけ、Actions ログに次の1行を出します。

  ```text
  IORI_NOTICE stage=remote-configuration-owner previous_uid=<数値> previous_gid=<数値>
  ```

- env.conf がシンボリックリンクである、通常ファイルでない、group か other に書き込み権限がある、存在しない、のいずれかの場合、`reason=source-config-unavailable` で失敗します。
- `chown` の後も所有者が root にならない場合、`reason=config-owner-reset-failed` で失敗します。
- 所有者の確認が済んだ後、env.conf の mode が 0600 でない場合、`sudo -n chmod 600` で mode を 0600 に直します。所有者がもともと root の場合も、この確認を行います。直したときだけ、Actions ログに次の1行を出します。`previous_mode` は、直す前の mode です。

  ```text
  IORI_NOTICE stage=remote-configuration-mode previous_mode=<4桁の8進数>
  ```

- `chmod` の後に mode が 0600 になっていない場合、または env.conf が `chmod` の前と別のファイルになっている場合、`reason=config-mode-reset-failed` で失敗します。

所有者を元に戻す必要があるかどうかは、管理役が判断します。元の uid は旧環境に存在しないアカウントのものです。作業者は `IORI_NOTICE` 行の `previous_uid` と `previous_gid` を管理役に伝え、旧環境で所有者を手作業で戻しません。

mode を元に戻す必要があるかどうかは、管理役が判断します。作業者は `previous_mode` を管理役に伝え、旧環境で mode を手作業で戻しません。

作業者は `program`、`exit`、`reason` の組で原因を切り分けます。

- `program` が `ssh` で `exit=255` の場合、または `program` が `rsync` で `exit` が `255` か `12` の場合に、`reason` が `ssh-*` なら、接続か認証が失敗しています。`ssh-*` は `ssh-auth-denied`、`ssh-host-key`、`ssh-key-format`、`ssh-timeout`、`ssh-refused`、`ssh-dns` です。作業者は production environment の `IORI_SOURCE_SSH_*` secret を確認します。作業者は、旧環境の authorized_keys と known_hosts の確認を、この `reason` を添えて管理役に伝えます。この項は `stage=status` の行には当てはまりません。
- `stage` が `remote-*` で、`reason` がリポジトリの固定エラー文言に対応する場合、旧環境が配備の前提条件を満たしていません。対応する `reason` は `source-pnpm-version`、`source-pnpm-invalid`、`source-dirty`、`source-repository-unexpected`、`source-checkout-invalid`、`source-deploy-blocked`、`upload-dir-unset` などです。作業者は、この `reason` を管理役に伝えて、対応する前提の確認を依頼します。
- `reason=source-config-unavailable` の場合、env.conf の種類か mode が不正です。作業者は、この reason を管理役に伝えて判断を仰ぎます。
- `reason=config-owner-reset-failed` の場合、`sudo -n chown 0:0` を実行した後も env.conf の所有者が root になっていません。作業者は、この reason を管理役に伝えて判断を仰ぎます。
- `reason=config-mode-reset-failed` の場合、`sudo -n chmod 600` を実行した後も env.conf の mode が 0600 になっていないか、env.conf が別のファイルに入れ替わっています。作業者は、この reason を管理役に伝えて判断を仰ぎます。
- `reason=upload-dir-missing` の場合、env.conf の `UPLOAD_DIR` が指すディレクトリが旧環境に存在しません。
- `reason=remote-node-missing` の場合、旧環境に nvm の node v24.12.0 がありません。
- `reason=remote-command-failed` の場合、旧環境で実行した git、pnpm、sudo のいずれかが失敗しています。作業者は `stage` から対象のコマンドを絞ります。
- `reason=readiness-failed`（`stage=status`）の場合、再起動後のアプリが応答した revision が配備した SHA と一致しないか、ingress の凍結、consumer の停止、queue の失敗のいずれかの状態です。配備はこの場合に再試行しません。
- `reason=source-control-not-ready`（`stage=status`）の場合、再起動したアプリが、上限 120 秒のあいだ control socket で応答できる状態になりませんでした。配備は status 段階で、socket が無い場合、接続を拒否された場合、アプリが準備中と応答した場合の3つだけを 3 秒間隔で再試行します。作業者は、この `reason` を管理役に伝えます。microblog サービスが起動しているかどうかと、起動に失敗していないかは、`diagnose-source` の `active`、`sub`、`journal` で読みます（[第7.2節](#72-旧環境の状態を読み取る)）。
- `IORI_NOTICE stage=status-unit active=<状態> sub=<副状態> result=<結果> restarts=<回数>` の行は、status 段階が失敗したときに、配備が microblog サービスの状態を読み取り専用の `systemctl show` で1回だけ読んだ結果です。配備は、この読み取りが失敗しても元の失敗を変えず、行を出さないだけです。配備は、サービスの再起動も `reset-failed` も実行しません。`result=start-limit-hit` の場合、systemd が起動回数の上限に達したために自動の再起動を止めています。start-limit-hit の後は、最初の起動から 180 秒の窓が過ぎるまで、systemd は手動の restart と次の配備の restart も拒否します。作業者は窓が過ぎるのを待ってから、管理役に手動の `systemctl restart microblog` を依頼するか、配備をやり直します。
- microblog サービスの unit（`apps/iori/microblog.service`）は、`Restart=always` と `RestartSec=5s` で再起動します。unit は `[Unit]` に `StartLimitIntervalSec=180` と `StartLimitBurst=30` を置くので、起動の失敗が続くと、systemd は約 150 秒のあいだ自動で再起動を試みます。この時間は、配備の status 確認が待つ 120 秒より長い時間です。再試行が上限に達するのは、180 秒の窓の中で 30 回起動したときだけです。アプリが数十秒動いてから落ちる場合は、上限に達せず、再起動を続けます。凍結中にこの再起動が続いた場合は、diagnose-source の `restarts` と `exits` で気付けます。旧環境の systemd は 235 以降です。2026-11-01 の diagnose-source（run 41283001455 と 41287264546）が、systemd 235 以降のプロパティである NRestarts を読めたことから判断しました。`[Unit]` の StartLimitIntervalSec と StartLimitBurst は、systemd 230 以降で効きます。
- `reason=source-operation-failed`（`stage=status`）の場合、status の確認が、再試行の対象でない理由で失敗しました。`stage=status` の行では `exit` と `signal` が常に `none` になるので、作業者はこの行から ssh の接続失敗と control socket の異常を区別できません。原因の候補は、ssh の接続失敗、control socket の mode や所有者の不正、応答の形式の不正です。作業者は、この `reason` を管理役に伝えます。`freeze` と `freeze_pending` の有無は、`diagnose-source` で読みます。`~/.iori-migration` の mode、所有者と control socket の状態は `diagnose-source` の出力に対応する値がないので、管理役に確認を依頼します。
- `reason=source-not-idle`（`stage=status`）の場合、アプリが control コマンドの実行中のために status を拒否しました。作業者は、実行中の operation（export など）が終わるのを待ってから再実行します。
- `prepare-target` の分類として、`reason=stopped-before-resources`（`stage=hosted-operation`、`exit=78`）の場合、`prepare-target` がリソースを作る前に止まっています。作業者は、[VAPID 値の確認](#vapid-値の確認)の `reason=stopped-before-resources` の項目に従って原因を確かめ、同じ generation で再実行します。
- `reason=unclassified` の場合、失敗は既知の分類に当たりません。作業者は分類表（`apps/iori/scripts/deploy-source.mjs`）への追加を検討します。

### 4.2 旧版へ戻す

Deploy iori（`deploy-iori.yml`）は、配備する SHA が最新の main であることを要求します。作業者は旧版へ戻すとき、旧環境に直接入って操作しません。手順は次のとおりです。

1. 作業者は、戻したい変更を main で revert する PR を作り、レビューを経て merge します。
2. main への push で Deploy iori が走ります。production environment の承認者が実行を承認します。
3. 作業者は、step「Deploy guarded exact source revision」が成功したことと、`IORI_DIAG` 行が出ていないことを確認します。
4. 作業者は、本番の応答を確認します。

配備が `status` 段階より前で失敗した場合、旧環境の dist、unit、nginx.conf は途中まで更新されている可能性があります。配備は退避を作りません。作業者は、revert した main で Deploy iori をもう一度実行し、旧版の内容で上書きします。

凍結（`~/.iori-migration/freeze.json` または `freeze.pending`）が残っている場合、配備はすべての段階で `reason=source-deploy-blocked` で止まります。作業者は、凍結の復旧を先に行います。`freeze.json` が残っている場合、作業者は `resume-source` を使います。手順は [7.1 節の `freeze.json` が残った場合](#freezejson-が残った場合)に書いてあります。`freeze.pending` が残っている場合、作業者は `release-pending-freeze` を使います。手順は [7.1 節の `freeze.pending` が残った場合](#freezepending-が残った場合)に書いてあります。

### 4.3 control socket が残った場合

アプリは起動時に `~/.iori-migration/control.sock` が残っていると、その socket に応答するプロセスがいないことを確かめてから削除します。確かめる条件は次の3つです。

- socket であること
- アプリと同じ uid の所有で、mode が 0600 であること
- 接続が拒否されること

条件を1つでも満たさない場合、アプリは `control_socket_exists` で起動に失敗します。

アプリは停止時に 60 秒の期限を持ちます。期限を過ぎると、アプリは自分が作った socket だけを削除して終了します。

アプリは起動のたびに、上の3つの条件を満たす残った socket を自動で削除します。microblog の unit は `Restart=always` を設定しているので、systemd が再起動するたびに、アプリはこの削除を行います。

それでも `control_socket_exists` で起動できない状態が続く場合、作業者は socket を手で削除しません。作業者は旧環境に直接入らず、管理役に判断を仰ぎます。

## 5. 実測 profile の作成と登録

staging 用の旧環境はありません。この移行では新しく作りません。実測 profile は、hosted operation `rehearse-migration` が作ります。`rehearse-migration` は `production` Environment で実行し、本番の source を実際に freeze して処理量を計測します。移行先には、本番の切替に使う generation とは別の、使い捨ての generation を使います。この節では、使い捨ての generation の名前に `prdrehearse1` を使います。

CI の `run-migration-fixture.mjs` と合成 PostgreSQL テストは機能検証です。実移行の容量・所要時間の証拠にはしません。

### 5.1 事前条件

- `main_sha` が、source にデプロイ済みの revision と一致する。一致しない場合、source は `revision_mismatch` で拒否する
- 使い捨て generation で `prepare-target` が完了している
- 登録済みの Secret が `migrate-data` と同じである。ただし `IORI_MIGRATION_REHEARSAL` は不要
- `estimate-source` が `sample=ok` と `capacity=ok` を出している。手順はこの節の末尾の[estimate-source で事前に確認する](#estimate-source-で事前に確認する)に書く

`rehearse-migration` は、source を凍結している区間に、全体で 30 分の上限を持ちます。定数 `REHEARSAL_FREEZE_LIMIT_MS` が、この 30 分を表します。この定数は `apps/iori/scripts/rehearse-protected-migration.mjs` にあります。30 分は、個人ブログで許容できる書き込み停止の長さです。

dispatch の承認前に、担当者が 30 分の書き込み停止を許容できるか確認します。`rehearse-migration` は、凍結する前に時間を判定しません。`apps/iori/scripts/rehearse-protected-migration.mjs` の `budget` は、標本不足と容量だけを検査します。

凍結が続く範囲は次のとおりです。

- 範囲は、freeze の開始から、export と restore が終わった直後の resume の完了までです。D1 import 以降は、凍結を解除した後に実行します。
- 30 分の上限は、freeze の呼び出しから restore の完了までの区間に、全体で1つだけ適用します。上限を超えると、`rehearse-migration` は自分で処理を中断し、resume を1回呼んで `Rehearsal freeze limit exceeded.` で失敗します。`rehearse-migration` は job の cancel に頼りません。
- 30 分の上限に当たると、`rehearse-migration` は resume を1回試みます。source 側で export などの処理がまだ動いている場合、source は resume を `source_not_idle` で拒否し、凍結が残ることがあります。上限に当たる原因は export か restore が遅いことが多いため、上限に当たった場合こそ凍結が残りやすくなります。SSH adapter は、resume を 70 秒で打ち切ります。

30 分を超える見込みの場合、計測は失敗し、generation の印 `rehearsal.json` だけが残ります。`rehearse-migration` は、印を freeze より前に書きます。そのため、その generation は再利用できません。

source 側と adapter 側には、次の時間上限があります。

- freeze は 70 秒です。SSH adapter が、`SOURCE_LIMITS.estimateMs` の 60 秒に 10 秒を足した時間で打ち切ります。
- drain は 300 秒です。executor が `source.drain(300_000)` を呼び、source がこの時間まで待ちます。SSH adapter は 310 秒で打ち切ります。
- drain の後の estimate は 70 秒です。executor が、freeze の後に容量と標本の判定をもう一度実行します。
- export は、source 側が 30 分 (`SOURCE_LIMITS.exportMs`)、SSH adapter 側が 31 分 (`SOURCE_LIMITS.socketMs`) です。
- restore は、最初に inventory を 70 秒以内に取得します。その後、ファイルを1つずつ転送します。1ファイルの上限は、source 側も SSH adapter 側も 5 分 (`SOURCE_LIMITS.transferMs`) です。転送するファイルは、31 table、export manifest 1つ、upload 1つにつき1ファイルで、合計 `upload_count + 32` 個です。restore 全体の時間上限はありません。
- resume は、5.2 に書きます。

各上限をすべて使い切った場合の凍結時間は、`upload_count` が 0 でも 12050 秒 (約 201 分) です。計算は 2450 + 300 × 32 です。2450 秒は、freeze、drain、estimate、export、inventory、resume の上限の合計です。300 × 32 秒は、restore の転送の上限です。この値は 30 分 (1800 秒) を大きく超えます。そのため、上限の合計は、30 分を超えるかどうかの事前見積もりに使えません。

`upload_count`、`table_bytes`、`upload_bytes` は、source の estimate が返す値です。estimate は、table の行を JSON にした大きさに、行ごとに改行1バイトを加えて合計した値を `table_bytes` として返します。dispatch の前にこの値を取るには、hosted operation `estimate-source` を使います。ただし `estimate-source` は `table_bytes` と `upload_bytes` を出さず、件数と判定だけを出します。`upload_count` は `estimate-source` の出力から読めます。`table_bytes` は dispatch の前には取れません。

転送速度の条件は次のとおりです。

- 転送速度が `table_bytes` ÷ 300 秒以上であれば、どの table ファイルも 5 分以内に転送できる見込みです。1つの table ファイルは、全 table の合計である `table_bytes` を超えない見込みだからです。
- upload ファイルは、1つが 32 MiB (`SOURCE_LIMITS.uploadBytes`) 以下です。転送速度が 32 MiB ÷ 300 秒以上であれば、どの upload ファイルも 5 分以内に転送できます。
- 5 分を超えたファイルが1つでもあれば、restore は失敗します。この場合は、失敗した時点で resume を呼びます。

実際の転送速度は、コードにも既存の文書にもありません。そのため、30 分を超えるかどうかを、dispatch の前に確定する方法はありません。

#### estimate-source で事前に確認する

`estimate-source` は、source の estimate だけを GitHub Actions から呼ぶ hosted operation です。source を freeze しません。`production` Environment で実行します。workflow とコードは `staging` の指定も受け付けます。`rehearse-migration` が freeze より前に判定する標本と容量を、凍結なしで先に確かめるために使います。

dispatch の入力は次のとおりです。

- `main_sha` に、現在の main の先頭を指定する
- `operation` に `estimate-source` を指定する
- `environment` に `production` を指定する。`staging` も受け付けるが、旧環境は production だけにあるため、production で実行する
- `generation` と `migration_run_id` は空にする。値を与えると workflow が拒否する
- `migration_main_sha` は指定しない
- `allowed_missing_uploads` は、欠けたファイルを許容するときだけ指定する。省略すると `0` として扱う。意味は[欠けたファイルを許容する](#欠けたファイルを許容する)に書く

run ID は、`estimate-source` が `estimate_<GITHUB_RUN_ID>` の形で内部に作ります。

```bash
iori_main_sha="$(gh api "repos/$iori_repo/commits/main" --jq .sha)"
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha="$iori_main_sha" \
  -f operation=estimate-source \
  -f environment=production
```

job に渡す secret は、`IORI_SOURCE_SSH_HOST`、`IORI_SOURCE_SSH_USER`、`IORI_SOURCE_SSH_PRIVATE_KEY`、`IORI_SOURCE_SSH_KNOWN_HOSTS` の4件だけです。Cloudflare、R2、Terraform、receipt 鍵の secret は渡しません。

`estimate-source` は、本番 PostgreSQL の全 table を読み取り専用 transaction で走査します。SQL 文ごとの `statement_timeout` は 30 秒で、source 側の estimate 全体の上限は 60 秒です。

成功すると、Actions ログに次の1行だけを出します。

```text
IORI_ESTIMATE rows=<n> upload_count=<n> upload_duplicate_count=<n> upload_missing_count=<n> upload_owner_count=<n> upload_not_regular_count=<n> upload_too_large_count=<n> upload_access_count=<n> upload_other_count=<n> upload_ext_webp_count=<n> upload_ext_png_count=<n> upload_ext_jpeg_count=<n> upload_ext_gif_count=<n> upload_failed_ext_webp_count=<n> upload_failed_ext_png_count=<n> upload_failed_ext_jpeg_count=<n> upload_failed_ext_gif_count=<n> article_count=<n> sample=ok|insufficient capacity=ok|insufficient
```

- `rows`、`upload_count`、`upload_duplicate_count`、`article_count` と、`upload_` で始まるそのほかの項目は件数です。件数は公開してよいと管理担当が判断しました。DB の行、URL、ファイル名は出しません
- `upload_count` は、`/uploads/` の形の URL を持つ `post_images` の行のうち、同じ URL を除いたファイルの数です。`upload_duplicate_count` は、同じファイルを参照して除いた行の数です。`https://` か `http://` で始まる URL の行は、どちらにも数えません
- `upload_missing_count`、`upload_owner_count`、`upload_not_regular_count`、`upload_too_large_count`、`upload_access_count`、`upload_other_count` は、`upload_count` のファイルのうち、estimate が開けなかったファイルの原因別の件数です。estimate は最初の失敗で止まらず、すべてのファイルを調べます。原因の意味は次のとおりです
  - `missing`: ファイルがない
  - `owner`: ファイルの所有者が、旧環境のサービスを動かすユーザーと違う
  - `not-regular`: 通常のファイルではない。シンボリックリンクを含みます
  - `too-large`: 1 ファイルのサイズの上限 (32 MiB) を超える
  - `access`: 権限がなく、ファイルを調べるか開けない
  - `other`: 上のどれにも当たらない。親ディレクトリの realpath の不一致や、開く前後の stat の食い違いを含みます
  - 1つのファイルが複数の原因に当たるときは、`owner`、`not-regular`、`too-large` の順で先に当たる原因として数えます。他ユーザー所有のシンボリックリンクは `owner` です
- `upload_ext_webp_count`、`upload_ext_png_count`、`upload_ext_jpeg_count`、`upload_ext_gif_count` は、`upload_count` のファイルを拡張子別に数えた件数です。`jpg` は `jpeg` に数えます。`upload_failed_ext_webp_count` のように `failed` を含む項目は、開けなかったファイルを拡張子別に数えた件数です
- 原因が `missing` 以外のファイルが 1 件でもあるか、`upload_missing_count` が `allowed_missing_uploads` と違うと、`estimate-source` は `IORI_ESTIMATE` の行を出した後で、`IORI_DIAG` の行を出して失敗します。`migrate-data` と `rehearse-migration` は freeze の前に失敗します。`allowed_missing_uploads` を省略すると `0` なので、`missing` が 1 件でもあれば失敗します。`IORI_DIAG` の `reason` は、`missing` 以外で件数が 1 以上の原因のうち、表の上にあるものです。`missing` 以外の原因が無く、数が合わないときの `reason` は `estimate-upload-missing` です
- `sample` は、3つの件数がすべて 1 以上なら `ok` です。どれかが 0 なら `insufficient` で、`rehearse-migration` は freeze の前に失敗します
- `capacity` は、source の空き容量、D1 の上限 10 GB (`10000000000` バイト)、runner の空き容量の3つの判定です。すべて足りれば `ok` です
- bytes の値は出しません。容量は `ok` と `insufficient` の判定だけを出します

`sample=ok` と `capacity=ok` の両方が出たことを確認してから、`rehearse-migration` を dispatch します。`insufficient` が出た場合は、`rehearse-migration` を dispatch しません。

#### 欠けたファイルを許容する

旧環境の `post_images` に、ファイルが存在しない行が残っている場合があります。作業者は、このファイルを移行から外すために `allowed_missing_uploads` を使います。

入力の決まりは次のとおりです。

- `allowed_missing_uploads` は、`estimate-source`、`rehearse-migration`、`migrate-data` の dispatch だけで使います。ほかの operation に値を入れると、workflow が拒否します。
- 値は `0` か、先頭が `0` ではない 6 桁以内の整数です。この形に合わない値は、workflow が拒否します。省略するか空にすると、`0` として扱います。
- 作業者は、直前の `estimate-source` が出した `upload_missing_count` と同じ値を入れます。`estimate-source` にも同じ値を入れると、`estimate-source` が成功します。
- 許容できるのは、原因が `missing` のファイルだけです。`owner`、`not-regular`、`too-large`、`access`、`other` の件数が 1 以上のときは、値に関係なく失敗します。
- 数えた欠けの数が `allowed_missing_uploads` と完全に一致したときだけ、処理が先へ進みます。欠けの数が多くても少なくても失敗します。

配備の順番の注意は次のとおりです。

- 作業者は、source をこの変更を含む main の SHA に配備してから、`rehearse-migration` と `migrate-data` を実行します。
- source の SHA が migration の main SHA と違うと、freeze の前に `Source revision mismatch` で失敗します。
- この変更より前のコードで作った bundle には `omittedCount` がありません。この bundle は `verify-import` と `cutover-route` を通りません。この場合、作業者は `migrate-data` からやり直します。

欠けたファイルの扱いは次のとおりです。

- 欠けたファイルは R2 に移りません。D1 の `post_images` の行は、ほかの行と同じようにそのまま移ります。
- 切替後に、Worker は欠けたファイルの URL に 404 を返します。旧環境でもファイルが無く 404 を返していたので、利用者に見える状態は変わりません。
- export の後に、runner は次の 1 行を公開ログに出します。出すのは数だけです。ファイル名は出しません。

```text
IORI_NOTICE stage=export-missing-uploads count=<n>
```

- `r2_import_manifest` に `omittedCount` を記録します。値は R2 に移さなかったファイルの数です。key は書きません。`verify-import` と `cutover-route` は、`objects` の数に `omittedCount` を足した値が、重複を除いた `/uploads/` のファイルの数と等しいことを検査します。この 2 つの operation は、署名済みの manifest を信頼するので、`allowed_missing_uploads` を入力に要りません。

値が合わないときの失敗は、次の 3 か所で起きます。

| 失敗する位置                           | 失敗の内容                                                                                                         | source の状態                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| freeze の前の estimate                 | `estimate-upload-missing` で失敗する。`rehearse-migration` は印も実行予約も書かず、`migrate-data` は予約を書かない | 凍結しない                                                                    |
| freeze と drain の後の estimate        | 欠けの数が変わっていた場合に、export の前に失敗する。転送しない                                                    | `migrate-data` は凍結が残る。`rehearse-migration` は自分で resume を 1 回呼ぶ |
| export の後、restore（転送）の前の検査 | export が数えた欠けの数が違う場合に、転送の前に失敗する                                                            | `migrate-data` は凍結が残る。`rehearse-migration` は自分で resume を 1 回呼ぶ |

`migrate-data` は、freeze の後に失敗しても、resume を呼びません。作業者は、凍結と実行予約を残したまま、第7.1節の手順で復旧します。`rehearse-migration` が呼ぶ resume に失敗した場合は、5.2 節の「凍結が残る可能性がある」場合と同じ扱いになります。

freeze の後の失敗の詳しい理由（`Source missing upload count mismatch.` など）は、公開ログに出ません。作業者は、公開ログの `IORI_NOTICE` の `count` と、`allowed_missing_uploads` に入れた値を見比べて、不一致を判断します。`IORI_NOTICE stage=export-missing-uploads` の行が公開ログに無いときは、export より前で失敗しています。失敗した段階は、drain の後の estimate か、それより前です。

source が凍結中の場合、`estimate-source` は失敗します。凍結中とは、source に `freeze.json` があり、別の run の identity が残っている状態です。`estimate-source` の run ID は `estimate_<GITHUB_RUN_ID>` なので、凍結した run の ID と一致しません。source は identity が一致しない command を `identity_mismatch` で拒否します。

`estimate-source` は、失敗すると `IORI_DIAG` の1行と、`Source estimate failed.` の固定文言を stderr に出します。Actions の公開ログに残るのは `IORI_DIAG` の行だけです。`Source estimate failed.` は公開ログに出ません。

```text
IORI_DIAG stage=estimate-source program=ssh exit=<0-255|none> signal=<名前|none> reason=<分類>
```

`reason` は固定の語彙から選びます。ssh の stderr、旧環境の応答の生の文字列、パス、ホスト名は出しません。runner 側の語彙の意味は次のとおりです。

| `reason`           | 意味                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `not-ready`        | 旧環境の control socket がまだ使えません。ssh は終了コード 75 で終わりました                                                                           |
| `busy`             | 旧環境が別の control コマンドを実行中です。ssh は終了コード 76 で終わりました                                                                          |
| `rejected`         | 旧環境が応答しましたが、拒否でした。拒否の理由は区別できません。たとえば `identity_mismatch` と `revision_mismatch` は、どちらも `rejected` になります |
| `invalid-response` | 旧環境の応答を JSON として読めないか、形が想定と違います                                                                                               |
| `spawn-failed`     | runner が ssh を起動できませんでした                                                                                                                   |
| `aborted`          | 時間切れか取り消しのために、runner が ssh を止めました                                                                                                 |
| `ssh-failed`       | 上のどれにも当たらない、0 以外の終了です。ssh の接続や認証の失敗と、旧環境側の node の失敗を含みます                                                   |

旧環境のサービスは、`estimate` が失敗した段を、拒否の応答に `detail` として載せます。runner は、この値が次の語彙に当たるときだけ、`reason` に使います。

| `reason`                      | 失敗した段                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `estimate-connect`            | DB への接続と transaction の開始                                                                                                                                        |
| `estimate-query`              | table ごとの SELECT、`post_images` の cursor、COMMIT                                                                                                                    |
| `estimate-upload-row`         | `post_images` の行の形と、url の形                                                                                                                                      |
| `estimate-upload-legacy-path` | post_images に `/static/uploads/` の形の URL が残っている。移行の前に旧環境の DB の URL を `/uploads/` に直す                                                           |
| `estimate-upload-same-origin` | post_images に移行元と同じ origin の `/uploads/` を指す絶対 URL が残っている。移行の前に旧環境の DB の URL を `/uploads/<ファイル名>` の形に直す                        |
| `estimate-upload-root`        | `UPLOAD_DIR` の realpath の確認                                                                                                                                         |
| `estimate-upload-open`        | estimate が開いたアップロードのファイルを閉じる処理など、原因別の6つの `reason` に当たらない段で失敗した                                                                |
| `estimate-upload-missing`     | estimate が開けなかったアップロードのファイルのうち、ファイルがないものの件数が `allowed_missing_uploads` と違う。件数は IORI_ESTIMATE の `upload_missing_count` を見る |
| `estimate-upload-owner`       | estimate が開けなかったアップロードのファイルのうち、所有者が違うものの件数が 1 以上ある。件数は IORI_ESTIMATE の `upload_owner_count` を見る                           |
| `estimate-upload-not-regular` | estimate が開けなかったアップロードのファイルのうち、通常のファイルでないものの件数が 1 以上ある。件数は IORI_ESTIMATE の `upload_not_regular_count` を見る             |
| `estimate-upload-too-large`   | estimate が開けなかったアップロードのファイルのうち、サイズが上限を超えるものの件数が 1 以上ある。件数は IORI_ESTIMATE の `upload_too_large_count` を見る               |
| `estimate-upload-access`      | estimate が開けなかったアップロードのファイルのうち、権限がないものの件数が 1 以上ある。件数は IORI_ESTIMATE の `upload_access_count` を見る                            |
| `estimate-upload-other`       | estimate が開けなかったアップロードのファイルのうち、上のどれにも当たらないものの件数が 1 以上ある。件数は IORI_ESTIMATE の `upload_other_count` を見る                 |
| `estimate-too-large`          | 全体のサイズか、ファイル数の上限の超過                                                                                                                                  |
| `estimate-limit`              | 制限時間 (60 秒) の超過、または runner との接続 (ssh か control socket) の切断                                                                                          |
| `estimate-other`              | 上のどの段にも当たらない失敗。空き容量の取得を含みます                                                                                                                  |

`reason` が `estimate-upload-missing`、`estimate-upload-owner`、`estimate-upload-not-regular`、`estimate-upload-too-large`、`estimate-upload-access`、`estimate-upload-other` のときは、ssh の失敗ではないので、`IORI_DIAG` の行は `program=none exit=none signal=none` で出ます。

`estimate-` で始まる語彙は、旧環境への配備 (`deploy-iori.yml`) の後に効きます。配備の前の旧環境は `detail` を返さないので、サービス側の失敗は `reason=rejected` になります。

PostgreSQL の接続の切断は、`estimate-connect` か `estimate-query` になります。

`reason` が `busy` になるのは、source の control socket が、control コマンドの実行中に拒否したときだけです。この場合、source は `control_busy` を返し、CI のクライアントは `control_busy` を終了コード 76 にします。`estimate-source` が失敗したときは、作業者が 5.2 節で凍結が残った場合の手順 1 と同じ方法で、`freeze.json` と `freeze.pending` の有無を確認します。

`main_sha` には、次の2つを同時に満たす値が必要です。

- source にデプロイ済みの revision と一致する。一致しない場合、source は `revision_mismatch` で拒否する
- 現在の main の先頭と一致する。一致しない場合、workflow は `assertReviewedMain` で拒否する

source の配備 workflow (`deploy-iori.yml`) は、`apps/iori/**`、`packages/**`、`.github/workflows/deploy-iori.yml` の変更を含む push で起動します。この3つの path の外の変更だけが main に入ると、main の先頭は進み、source は再配備されません。この場合、2つの条件を同時に満たせません。作業者は、先に第4節の `deploy-iori.yml` を手動で dispatch して source を配備し直し、その後に `estimate-source` を実行します。

### 5.2 rehearse-migration の処理

1. `rehearse-migration` は、transfer R2 bucket が非公開であることを検査してから、準備記録を読み取ります。続けて、application R2 の uploads bucket が非公開であることを検査します。検査の対象は `domains/managed` と `domains/custom` です。bucket が公開されている場合、`rehearse-migration` は freeze の前に失敗します。その後、移行先の状態を読み取り、フォントを読み込みます。`migrate-data` も同じ順序で同じ検査をします。
2. source の estimate を取得します。件数の `rows`、`upload_count`、`article_count` のどれかが 0 の場合、`rehearse-migration` は freeze する前に失敗します。原因が `missing` 以外のファイルが 1 件でもある場合と、`upload_missing_count` が `allowed_missing_uploads` と違う場合も、freeze する前に失敗します。
3. 容量を判定します。判定は `migrate-data` と同じです。時間の判定はしません。`d1_capacity_bytes` は Workers Paid の D1 上限である `10000000000` に固定します。
4. 手順 1〜3 を通った後で、`prepared-target/v1/<environment>/<generation>/rehearsal.json` を書きます。
5. `migrate-data` と同じ実行予約を書き、読み戻して確認します。
6. `rehearse-migration` は本番の source を freeze し、drain を行います。drain の後に、手順 2 と 3 の判定をもう一度実行します。その後に export を行います。export の後、restore の前に、export が数えた欠けの数が `allowed_missing_uploads` と一致することを検査します。一致しない場合は転送せずに失敗します。一致した場合は restore を行い、restore が終わった直後に resume します。
7. 凍結を解除した後に、D1 import、R2/OGP import、検証を行います。

手順 1〜3 で失敗した場合、`rehearse-migration` は `rehearsal.json` を書いていません。この場合は、同じ generation で `rehearse-migration` を再実行できます。手順 4 以降で失敗した場合は、同じ generation では再実行できません。

凍結の時間は、freeze から restore 完了までです。本番への書き込みは、この間止まります。

`rehearse-migration` は、凍結を始めた後、プロセスが動いている限り、resume を1回呼びます。restore の直後に resume が成功した場合は、終了時に resume を呼びません。失敗した場合も中断した場合も、プロセスは終了する前に resume を呼びます。resume は再試行しません。resume の待ち時間は 120 秒です。ただし、SSH adapter は resume を 70 秒で打ち切ります。

次の場合は、凍結が残る可能性があります。

- job をキャンセルした場合に、SIGKILL までの猶予内に SSH の resume が終わらないとき。hosted workflow の親プロセスは、中断を受けると `rehearse-migration` のプロセスへ SIGTERM を送り、15 秒後に SIGKILL を送ります。凍結の区間では job をキャンセルせず、止めたい場合は、30 分の上限で `rehearse-migration` が中断するのを待ちます。
- runner が失われた場合。プロセスが消えるため、resume を呼べません。
- `timeout-minutes: 360` で job が強制終了された場合。executor の deadline は 345 分なので、通常は deadline の中断で resume を呼びます。強制終了までに resume が終わらなかった場合に、凍結が残ります。
- resume 自体が失敗した場合。たとえば、source が `source_not_frozen` や `source_not_idle` を返したとき、SSH が失敗したとき、待ち時間を超えたときです。
- 30 分の上限で中断した後、source が resume を `source_not_idle` で拒否した場合。

凍結が残った場合、書き込みは自動では再開しません。担当者が次の順に作業します。

1. `diagnose-source` の `freeze` と `freeze_pending` で、凍結の有無を確認します。確認の方法は、第4節の「凍結」の行と同じです。どちらかがあれば、再配備も再起動もしません。再起動では凍結が解除されないためです。
2. 使い捨て generation で通常の書き込みを有効にしていないことを確認します。`rehearse-migration` は署名つき bundle を公開しないため、5.3 のとおり `cutover-route` は進みません。
3. 復旧を明示的に承認した後、[第7.1節](#71-凍結が残った場合の復旧)の「`freeze.json` が残った場合」に従って、`resume-source` を dispatch します。`migration_main_sha` と `migration_run_id` には、失敗した `rehearse-migration` と同じ `main_sha` と `run_id` を指定します。`recovery` には、手順 2 で書き込み未有効を確認しているため、`destination_writes_not_enabled` を指定します。`resume-source` は、resume を送る前に、source が凍結していること、source が idle であること、凍結の identity が input と一致することを status で確かめます。
4. 復旧の条件は [cutover runbook の Rollback](./cloudflare-cutover-runbook.md#4-rollback) に従います。`resume-source` が失敗した場合の対応は、第7.1節の「`freeze.json` が残った場合」に従います。`recovery` の値の選び方と失敗の意味も、第7.1節に書きます。
5. resume の後に、`freeze.json` と `freeze.pending` が無いことを、手順 1 と同じ方法でもう一度確認します。

`freeze.pending` が残っている場合、source control は `invalid_freeze_state` を返して、resume を含むすべてのコマンドを拒否します。この場合、`resume-source` は使えません。作業者は第7.1節の「`freeze.pending` が残った場合」に従って、`release-pending-freeze` を dispatch します。

rate は、`migrationBudget` の式の各項と同じ作業量を、その作業を含むフェーズの経過時間で割って求めます。フェーズは重複して数えるため、見積もりは保守的になります。計測値はそのまま profile に使います。`migrate-data` の `migrationBudget` が時間を2倍にし、固定の overhead も足すため、計測側では安全係数を掛けません。

rate の数え方により、`migrate-data` の見積もりは実際の所要時間より大きくなります。フェーズの時間を次のように置きます。

- `t_export`: `export-postgres` フェーズの時間。export と restore を含みます。
- `t_d1`: `convert-and-import-d1` フェーズの時間。
- `t_obj`: `import-r2-and-ogp` フェーズの時間。

`rehearse-protected-migration.mjs` は、次の4つの rate を求めます。

- `bytes_per_second` は、(`raw` × 3 + `sqlBytes`) ÷ (`t_export` + `t_d1`) です。
- `rows_per_second` は、`rows` × 3 ÷ `t_d1` です。
- `files_per_second` は、(`upload_count` × 3 + `fileCount` × 2) ÷ (`t_d1` + `t_obj`) です。
- `ogp_per_second` は、`article_count` ÷ `t_obj` です。

`migrate-data` の作業量が計測時と同じ場合、`migration-budget.mjs` の `estimatedMs` は、各項の作業量をこの rate で割ります。各項は `t_export + t_d1`、`t_d1`、`t_d1 + t_obj`、`t_obj` に戻ります。合計すると、見積もりは次の式になります。単位は秒です。

```text
2 × (600 + t_export + 3 × t_d1 + 2 × t_obj)
```

実際の所要時間は `t_export + t_d1 + t_obj` です。見積もりは、D1 フェーズの時間を3倍、オブジェクト import の時間を2倍に数えます。D1 import が長い場合は、期限内に終わる移行でも、`migrate-data` が見積もりの超過で拒否することがあります。

`migrate-data` は、`estimatedMs` に 15 分の cleanup 余裕 (`CLEANUP_MARGIN_MS`) を足した値が残り時間を超えると拒否します。残り時間の最大値は 345 分、つまり 20700 秒です。最大値の場合、拒否されない条件は `t_export + 3 × t_d1 + 2 × t_obj` が 9300 秒以下であることです。

### 5.3 生成物と誤用の防止

`rehearse-migration` は、使い捨て generation の transfer R2 bucket に、次の key で envelope を置きます。

```text
iori-migration/v1/<environment>/<main_sha>/<run_id>/rehearsal-profile
```

envelope は JSON です。schema は `iori-migration-rehearsal-envelope/v1` で、profile 文字列、`profile_sha256`、Ed25519 署名を含みます。署名には migration receipt の秘密鍵を使います。job ログに profile は出ません。

誤用は次の仕組みで防ぎます。

- `rehearse-migration` が書く `rehearsal.json` は印です。`migrate-data` は、この印がある generation を拒否します。
- 印を書いた後は、同じ generation で `rehearse-migration` を2回実行できません。`rehearse-migration` は、準備記録の読み取り、標本不足の判定、容量の判定を終えた後で印を書きます。印を書いた後に失敗した場合は、同じ generation では再実行できません。印を書く前に失敗した場合は、同じ generation で再実行できます。
- `rehearse-migration` は署名つき bundle を公開しません。そのため、この `run_id` では `verify-import` と `cutover-route` が進みません。

### 5.4 profile の登録

作業者はローカルで次の順に実行します。`iori_ops_dir` は第0節で作った一時作業領域です。公開鍵 PEM は第3.2節で登録した公開鍵と同じファイルを使います。

```bash
umask 077
iori_rehearsal_bucket='<使い捨てgenerationのtransfer bucket名>'
iori_rehearsal_envelope="$iori_ops_dir/rehearsal-envelope.json"
iori_receipt_public_key_sha256='<公開鍵ファイルのSHA-256>'

pnpm --silent --filter iori exec wrangler r2 object get \
  "$iori_rehearsal_bucket/iori-migration/v1/production/$iori_main_sha/$iori_migration_run_id/rehearsal-profile" \
  --file "$iori_rehearsal_envelope" --remote
```

次に、署名と形式を検証します。`verify-rehearsal-profile.mjs` は、検証した profile JSON だけを標準出力に出します。このスクリプトは、検証に失敗すると exit 1 で終わり、固定の文言だけを標準エラー出力に出します。

パイプでつなぐと、スクリプトが失敗しても `gh secret set` が実行され、空の値を登録するおそれがあります。そのため、出力を一時ファイルに書き、スクリプトが成功した場合だけ `&&` で `gh secret set` を実行します。一時ファイルは、envelope と同じ `$iori_ops_dir` に置きます。第5.4節の最初のブロックで実行した `umask 077` が、同じシェルで有効なままです。最後の `rm -f` は `&&` でつながず別の行に書くため、成功した場合と失敗した場合の両方で envelope と profile の一時ファイルを削除します。

```bash
iori_rehearsal_profile="$iori_ops_dir/rehearsal-profile.json"

node apps/iori/scripts/verify-rehearsal-profile.mjs \
  "$iori_rehearsal_envelope" "$iori_ops_dir/receipt-public.pem" \
  "$iori_receipt_public_key_sha256" "$iori_main_sha" \
  > "$iori_rehearsal_profile" \
  && gh secret set IORI_MIGRATION_REHEARSAL --repo "$iori_repo" --env production \
    < "$iori_rehearsal_profile"
rm -f "$iori_rehearsal_envelope" "$iori_rehearsal_profile"
```

登録する profile の `main_sha` は、本番の `migrate-data` を実行する `main_sha` と一致する必要があります。`main_sha` が変わった場合は、計測をやり直します。同じ generation では `rehearse-migration` を再実行できないため、新しい使い捨て generation を選び、`prepare-target` からやり直します。

### probe-cutover-route で cutover-route を予行する

#### 目的

`cutover-route` は、本番を止めている間に初めて動きます。`probe-cutover-route` は、本番を止める前に、計測用の generation に対して次の 2 点を確かめます。

- route の plan と Queue の再開の plan を取り、`cutover-route` と同じ検査を通します。`probe-cutover-route` は apply をしません。
- Worker の admission を sealed から smoke に切り替え、workers.dev の hostname で smoke を通し、sealed に戻します。

#### 前提条件

- 作業者は、計測3 が終わった後に、最後の計測で import した generation に対して `probe-cutover-route` を実行します。
- 対象は、`rehearse-migration` を実行した generation だけです。transfer bucket に `rehearsal.json` が無い generation では、`probe-cutover-route` は `rehearsal-missing` で止まります。本番の generation には実行できません。
- 作業者は、dispatch の前に、`IORI_ADMISSION_IDENTITY` をその generation 用に登録し直します。登録し直す値は、`generation`、`mainSha`、`runId`、`workerHostname` です。
- 作業者は、登録し直す値を `rehearse-migration` を実行したときと同じ値にします。違う値にすると、[第5.5節](#55-使い捨て-generation-の後片付け)の `purge-rehearsal-target` がその generation を拒否します。
- 作業者は、dispatch の前に、`smoke.username`、`smoke.articleId`、`smoke.uploadFilename` が import 済みのデータにあることを確かめます。OGP の backfill が済んでいることも確かめます。
- `production` の Environment の承認が要ります。job が使う Cloudflare API token は、`cutover-route` と同じ `IORI_CLOUDFLARE_CUTOVER_API_TOKEN` です。Terraform の state の鍵は、`IORI_TERRAFORM_WRITE` の鍵です。job は SSH の secret を使わず、旧サーバーにも触れません。

#### 段の順序と公開ログ

公開ログには `stage=probe-<段>` の形で出ます。段は次の順です。

```text
inputs → rehearsal-gate → tf-init → read-sealed → route-plan → queue-plan → to-smoke → smoke-worker → to-sealed → read-final
```

失敗した段によって、`probe-cutover-route` は次のように動きます。

- `smoke-worker` が失敗したとき: `probe-cutover-route` は `to-sealed` で sealed に戻してから、`smoke-worker` の失敗を報告します。
- `to-smoke` が失敗したとき: `probe-cutover-route` は、いま配信されている Worker の version を読み直します。version が `to-smoke` の前と違うときだけ、その version から `to-sealed` で sealed に戻します。version が同じときと、version を読めないときは、sealed に戻さずに `to-smoke` の失敗を報告します。
- `probe-cutover-route` が中断したときとタイムアウトしたとき: `probe-cutover-route` は、自分の signal から切り離した 15 分のタイムアウトで `to-sealed` を実行します。

sealed に戻す処理も失敗したときは、公開ログに元の失敗（`to-smoke` または `smoke-worker`）の行を先に出し、その後に `to-sealed` の失敗の行を出します。

#### Worker が smoke のまま残ったとき

Worker が smoke のまま残る可能性があるのは、次の 2 つの場合です。

- sealed に戻す処理（`to-sealed`）が失敗した場合
- `to-smoke` が失敗した後に、Worker の version を読めなかった場合

smoke のまま残った Worker は、workers.dev の hostname で、正しい smoke の token を付けたリクエストだけを受け付けます。受け付けるのは、smoke の検査用に決められたパスへの GET と、`/__smoke__/queue-enqueue` への POST だけです。GET は読み取り専用の環境で処理します。token が無いリクエストと、決められたパス以外へのリクエストには 503 を返します。canonical の hostname には route が無いので、canonical の hostname からは Worker に届きません。

対処は次のとおりです。

- 作業者がその generation に `probe-cutover-route` をもう一度実行しても、`read-sealed` 段が `worker-binding-mismatch` で止まります。「再実行」の節の「何度でも実行できます」は、Worker が sealed に戻った generation に限ります。
- 作業者は、その generation で予行を続けず、[第5.5節](#55-使い捨て-generation-の後片付け)の `purge-rehearsal-target` に進みます。`purge-rehearsal-target` は Worker の mode と version を確かめないので、Worker が smoke のままでも、その generation を削除できます。
- その generation では、`probe-cutover-route` を実行した後と同じく、Worker の version が `record.json` の値と違うため、`cutover-route`、`migrate-data`、`verify-import` も通りません。

#### 実行後に残るもの

- Worker に新しい版が 2 回 deploy されます。最後の版は sealed です。
- smoke の Queue enqueue の検査は、専用の POST `/__smoke__/queue-enqueue` を使い、その generation の Queue に smoke の marker を 1 件積みます。marker は連合の activity ではありません。Queue は paused です。consumer は、admission の mode が active でないとき、取り出した message を処理せずに retry に戻します。このため、marker は処理されずに Queue に残ります。
- route は作られません。Queue は paused のままです。

#### 本番に影響しない理由

- D1、R2、KV、Queue、Terraform の state は generation ごとに分かれています。`probe-cutover-route` は、その generation のものだけを扱います。
- route の plan の中身は、本番の hostname を計測用の Worker に向ける route の create です。`probe-cutover-route` は、この plan を apply しません。
- smoke は `workerHostname` にだけ送ります。canonical の hostname には送りません。route が無い時点で canonical の hostname に送ると、旧サーバーに smoke 用の token が届くからです。
- smoke のリクエストでは、Worker は読み取り専用の環境に差し替えます。この環境は、D1 では SELECT だけ、R2 と KV では読み取りだけを許し、FEDIFY_QUEUE への送信を拒否します。このため、smoke のリクエストが連合の配送（ActivityPub の activity）を Queue に積むことはありません。Queue に積まれるのは、専用のパスから送る smoke の marker だけです。Queue は paused なので、本番の followers に配送されることもありません。
- 計測用の generation の D1 には、本番の鍵と followers のコピーがあります。`probe-cutover-route` は、active への切り替えと Queue の再開をしません。作業者は、この generation を active にしたり、Queue を再開したりしてはいけません。

#### 確かめられない点

- `probe-cutover-route` は、Queue の再開の plan を、route を無効にした状態で取ります。route がまだ無い generation で route を有効にすると、plan に route の create が混ざり、Queue の検査がその plan を拒否するからです。このため、`probe-cutover-route` は、本番の `cutover-route` と同じ形の plan を確かめられません。本番の plan は、route を作った後の Queue の再開の plan で、route は no-op になります。
- `probe-cutover-route` は、署名つき bundle の復元、canonical の hostname への smoke、active への切り替え、route と Queue の apply を確かめられません。

#### 再実行

`probe-cutover-route` は、同じ generation に何度でも実行できます。`read-sealed` 段が、`record.json` の `worker_version_id` の代わりに、いま配信されている Worker の version で照合するからです。この段は、sealed であること、binding、Queue の paused、route が無いことを、record の version を使わずに検査します。

`probe-cutover-route` を実行した後は、Worker の version が `record.json` の値と違う値になります。このため、その generation では `cutover-route`、`migrate-data`、`verify-import` が通りません。

`cutover-route`、`migrate-data`、`verify-import` の `read-sealed` 段は、これまでどおり `record.json` の version と照合します。

### 5.5 使い捨て generation の後片付け

使い捨て generation には、本番の実データが匿名化されずに残ります。実データは個人データを含みます。残る場所は次のとおりです。

- D1 には、`rehearse-migration` が import した全 31 table の行が残ります。
- application R2 の uploads bucket には、`post-images/<id>/original` の元画像と、`og/<id>.png` の OGP 画像が残ります。
- transfer R2 bucket には、`rehearse-migration` が本番の実データを書きません。bucket にあるのは、準備記録、`rehearsal.json`、実行予約、`rehearsal-profile` の envelope です。envelope の profile は処理速度の数値だけです。

D1 と application R2 の実データは、hosted operation `purge-rehearsal-target` が削除します。実データが残る期間は、`rehearse-migration` の import から `purge-rehearsal-target` の成功までです。計測の直後に `purge-rehearsal-target` を実行し、`migrate-data` を実行する時期や cutover まで待ちません。

#### purge-rehearsal-target の処理

`purge-rehearsal-target` は、次の順に処理します。

1. 準備記録を読み取ります。このとき transfer R2 bucket が非公開であることも検査します。
2. transfer R2 に `rehearsal.json` があることを確認します。`rehearsal.json` は `rehearse-migration` が書く印です。印の `main_sha` と `run_id` が dispatch の `migration_main_sha` と `migration_run_id` に一致しない場合、`purge-rehearsal-target` は失敗します。印が無い generation も失敗します。`migrate-data` は印のある generation を拒否するため、本番の切替に使う generation は対象になりません。
3. application R2 の uploads bucket が非公開であることを検査します。検査の対象は `domains/managed` と `domains/custom` です。公開されている場合、`purge-rehearsal-target` は何も削除せずに失敗します。
4. D1 の application table に、import 順の逆順で `DELETE` を実行します。その後、全 table の `COUNT` が 0 であることを確かめます。
5. application R2 の uploads bucket の全 object を列挙し、1000 件ずつ削除します。削除の後に再び列挙し、0 件であることを確かめます。

`purge-rehearsal-target` は、transfer R2 に何も書かず、何も削除しません。transfer R2 の envelope と印は残ります。そのため、`purge-rehearsal-target` の前に envelope を回収する必要はありません。ただし、5.4 の登録は先に済ませておきます。印が残るため、この generation は再利用できません。

`purge-rehearsal-target` は何度実行しても同じ結果になります。Actions に出す文言は固定で、件数や名前は出しません。失敗した場合は、generation を保持したまま原因を確認し、同じ入力で再実行できます。

#### 実行前に確認すること

次の2点は、リポジトリの中からは確かめられません。作業者が dispatch の前に確認します。

- `IORI_CLOUDFLARE_MIGRATE_API_TOKEN` が、application R2 bucket の `domains/managed` と `domains/custom` を GET できる
- `IORI_CLOUDFLARE_MIGRATE_API_TOKEN` が、D1 に対して `DELETE` と `SELECT` を実行できる

次の3点は、第3.1節「未作成の bucket に限定した R2 S3 credential の作成」の段階 B にある `IORI_APPLICATION_R2_WRITE` の疎通確認で、最初の2点を確かめます。3点目は確かめられません。

- `IORI_APPLICATION_R2_WRITE` の範囲に、使い捨て generation の uploads bucket が含まれている。段階 B の `s3 PUT` が 200 を返すことで確かめる
- `IORI_APPLICATION_R2_WRITE` が、`ListObjectsV2` を許している。段階 B の `s3 GET "${UPLOADS_BUCKET}?list-type=2"` が 200 を返すことで確かめる
- `IORI_APPLICATION_R2_WRITE` が、`DeleteObjects` を許している。段階 B の `s3` 関数は DeleteObjects の本文を送れないので、段階 B では確かめられない [要確認]

#### dispatch

dispatch の入力は次のとおりです。

- `main_sha` に、現在の main の先頭を指定する。workflow はこの値で code を checkout し、main の先頭との一致を検査する
- `migration_main_sha` に、`rehearse-migration` を実行したときの `main_sha` を指定する
- `migration_run_id` に、`rehearse-migration` を実行したときの値を指定する
- `generation` に、使い捨て generation を指定する
- `environment` に `production` を指定する

`main_sha` と `migration_main_sha` は異なってよいので、`rehearse-migration` の後に main が進んでいても `purge-rehearsal-target` を実行できます。準備記録と印の照合には、`migration_main_sha` と `migration_run_id` を使います。

`IORI_ADMISSION_IDENTITY` には、次の前提があります。`purge-rehearsal-target` の job は、子プロセスに渡す `MAIN_SHA` を `migration_main_sha` に差し替えます。`read-migration-target` は、`IORI_ADMISSION_IDENTITY` の `mainSha` が、この `MAIN_SHA` と一致することを要求します。同じ検査は `environment`、`generation`、`runId` にもあります。そのため、`purge-rehearsal-target` の時点の `IORI_ADMISSION_IDENTITY` は、`rehearse-migration` を実行したときの SHA、generation、run ID で作った値である必要があります。この前提は `deploy-worker` と同じです。

作業者は、`purge-rehearsal-target` を `rehearse-migration` の直後に実行します。作業者は、`IORI_ADMISSION_IDENTITY` を本番用 generation（または次の計測）の値に切り替える前に、`purge-rehearsal-target` を実行します。切り替えた後に実行すると、`read-migration-target` が `purge-rehearsal-target` を拒否します。

```bash
iori_main_sha="$(gh api "repos/$iori_repo/commits/main" --jq .sha)"
iori_migration_main_sha='<rehearse-migration を実行した main_sha>'
iori_generation='<使い捨て generation>'
iori_migration_run_id='<rehearse-migration を実行した run ID>'
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha="$iori_main_sha" \
  -f migration_main_sha="$iori_migration_main_sha" \
  -f operation=purge-rehearsal-target \
  -f environment=production \
  -f generation="$iori_generation" \
  -f migration_run_id="$iori_migration_run_id"
```

job に渡す credential は、`rehearse-migration` と同じものに加えて次のとおりです。ただし、transfer R2 は読み取り専用の credential で読むだけです。

- `CLOUDFLARE_API_TOKEN` に `IORI_CLOUDFLARE_MIGRATE_API_TOKEN` を渡す
- application R2 に `IORI_APPLICATION_R2_WRITE_*` を渡す
- Terraform backend の読み取りに `IORI_TERRAFORM_READ_ONLY_*` を渡す
- transfer R2 の読み取りに `IORI_TRANSFER_R2_READ_ONLY_*` を渡す

SSH の secret、receipt の鍵、`IORI_MIGRATION_REHEARSAL` は渡しません。

#### リソースの削除

`purge-rehearsal-target` は、D1 database、R2 bucket、KV、Queue、Worker などのリソースを削除しません。リソースの削除は、後続の手作業の項目です。手作業にする理由は次のとおりです。

- `apps/iori/infra/cloudflare/main.tf` に、`prevent_destroy = true` を設定したリソースがあります。
- Worker は Terraform の管理外です。`apps/iori/infra/cloudflare/` に Worker を作る resource はありません。
- [cutover runbook](./cloudflare-cutover-runbook.md)は、旧リソースの adoption、state move、destroy をこの hosted workflow の経路に含めないと定めています。

リソースの削除手順は、レビューして明示承認を得るまで未整備です。作業者は、承認を得るまで使い捨て generation のリソースと state を保持します。削除手順は [#500](https://github.com/iwasa-kosui/monorepo/issues/500) で整えます。

#### 実データへの到達経路

`purge-rehearsal-target` を実行する前の使い捨て generation の実データに到達できる経路は、コードと既存の文書で確かめられた範囲で次のとおりです。

- Worker は `sealed` の状態です。`sealed` の Worker は、すべての HTTP リクエストを 503 で拒否します。`workers.dev` の subdomain は有効ですが、同じ拒否が適用されます。
- `rehearse-migration` は route を作りません。`cutover-route` も進まないため、本番の hostname から使い捨て generation には到達しません。
- transfer R2 bucket は非公開です。`prepare-target` と `rehearse-migration` は、bucket の managed domain と custom domain が無効であることを Cloudflare API で確認します。
- application R2 の uploads bucket に、公開 domain を作る Terraform resource はありません。`rehearse-migration`、`migrate-data`、`purge-rehearsal-target` は、uploads bucket の `domains/managed` と `domains/custom` が無効であることを Cloudflare API で検査し、公開されていれば失敗します。`rehearse-migration` と `migrate-data` は freeze の前に、`purge-rehearsal-target` は削除の前に検査します。
- 残る経路は、`production` Environment に登録した Cloudflare API token と R2 の credential を使う操作です。

**完了条件:** 本番の `migrate-data` を実行する `main_sha` と同じ `main_sha` の profile が、`production` Environment の `IORI_MIGRATION_REHEARSAL` に登録されている。ローカルの envelope の一時ファイルを削除している。`purge-rehearsal-target` の job が成功している。source の `freeze.json` と `freeze.pending` が残っておらず、書き込みが再開している。`rehearse-migration` は署名つき bundle を公開しないため、bundle の復元と再検証は計測の対象外である。

## 6. Hosted workflow の実行

### 6.1 実行を固定する

この節は第1〜5節の該当する前提が揃い、PR のレビューと明示承認後の merge が完了してから使います。`prepare-target` は profile/source の配備前にも実行できますが、認証・Environment・その操作の credential・確定 identity は必要です。

```bash
iori_main_sha="$(gh api "repos/$iori_repo/commits/main" --jq .sha)"
iori_environment=production
iori_generation='<承認済みの新しいgeneration>'
iori_migration_run_id='<固定した移行runID>'
```

この例は `production` で実行します。staging を使う場合だけ、`iori_environment` を `staging` に変更します。`iori_main_sha` をレビュー対象および Environment の identity/profile と照合します。main が進んだら実行を止めて再レビューし、古い identity を黙って書き換えません。PR head をそのまま main SHA として使いません。

### 6.2 一段階ずつ dispatch する

最初は `prepare-target` を指定します。1回の実行が成功し、次の行の前提も満たしてから `iori_operation` だけを変更して同じコマンドを使います。

表のうち、順序に「計測」を含む行は、`migrate-data` より前に第5節の手順で実施します。`estimate-source` の dispatch では、`generation` と `migration_run_id` を空にします。下のコマンドは `generation` と `migration_run_id` を常に渡すので、`estimate-source` では下のコマンドを使わず、[第5.1節](#estimate-source-で事前に確認する)のコマンドを使います。`purge-rehearsal-target` を含む計測用の dispatch では、`iori_environment` を `production`、`iori_generation` を使い捨て generation の名前（第5節の例は `prdrehearse1`）にします。本番用 generation の `iori_generation` と取り違えないでください。

```bash
iori_operation=prepare-target
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha="$iori_main_sha" \
  -f operation="$iori_operation" \
  -f environment="$iori_environment" \
  -f generation="$iori_generation" \
  -f migration_run_id="$iori_migration_run_id"
```

`rehearse-migration` と `migrate-data` を dispatch するときは、上のコマンドに `-f allowed_missing_uploads=<n>` を足します。`<n>` には、直前の `estimate-source` の `upload_missing_count` と同じ値を入れます。欠けたファイルが無ければ、足しません。意味と失敗の位置は[欠けたファイルを許容する](#欠けたファイルを許容する)に書きます。`rehearse-migration` と `migrate-data` のどちらも、`allowed_missing_uploads` を同じ入力から受け取ります。

| 順序       | Operation                                                    | 次へ進む条件                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 計測の前   | `estimate-source`（`generation` と `migration_run_id` は空） | 出力が `sample=ok` と `capacity=ok`。freeze はしない。欠けたファイルがある場合は `allowed_missing_uploads` に `upload_missing_count` と同じ値を入れる。手順は[第5.1節](#estimate-source-で事前に確認する) |
| 計測1      | `prepare-target`（使い捨て generation）                      | 本番用 generation とは別の generation で、順序 1 と同じ条件が成功                                                                                                                                         |
| 計測2      | `rehearse-migration`（使い捨て generation）                  | transfer bucket に envelope が保存され、source の凍結が解除されている。この run ID では `verify-import` と `cutover-route` は進まない。欠けたファイルがある場合は `allowed_missing_uploads` を指定する    |
| 計測3      | profile 登録（ローカル操作。dispatch はしない）              | [第5.4節](#54-profile-の登録)の手順で `IORI_MIGRATION_REHEARSAL` を登録し、一時ファイルを削除                                                                                                             |
| 計測3 の後 | `probe-cutover-route`（使い捨て generation）                 | job が成功し、全段が通っている。route は作られない。手順は[probe-cutover-route で cutover-route を予行する](#probe-cutover-route-で-cutover-route-を予行する)                                             |
| 計測の後   | `purge-rehearsal-target`（使い捨て generation）              | job が成功し、D1 の全 table と application R2 の uploads bucket が空。リソースは残る。手順は[第5.5節](#55-使い捨て-generation-の後片付け)                                                                 |
| 1          | `prepare-target`（本番用 generation）                        | VAPID の検査（[VAPID 値の確認](#vapid-値の確認)）が成功、Fresh state、sealed Worker、route absent、Queue 配送停止、consumer と prepared record の実 readback が成功                                       |
| 2          | `migrate-data`                                               | source/profile/容量を事前検査後、凍結・drain、全 import・照合、署名 bundle と complete marker の保存が成功。欠けたファイルがある場合は `allowed_missing_uploads` を指定する                               |
| 3          | `verify-import`                                              | 別の新しい runner で bundle を復元し、署名・D1/R2/OGP の実データを再検証して成功                                                                                                                          |
| 4          | `cutover-route`                                              | 同じ job 内の fresh restore、workers.dev smoke、route、canonical smoke、source 凍結の照合、HTTP 有効化、Queue の最後の再開と smoke が成功                                                                 |

上の表の operation に加えて、旧環境（source）に書き込む operation が2つあります。

- `resume-source`: 凍結が残った source の凍結を解きます。
- `release-pending-freeze`: 凍結の前段階で残った `freeze.pending` を退避します。

この2つは移行の順序に含まれません。凍結が残ったときの復旧だけに使います。environment には dispatch の input の environment を使います。production では Environment の承認が必要です。手順は第7.1節に書きます。この2つの dispatch は `migration_main_sha` を必要とし、`resume-source` は `recovery` も必要とするため、上の例は使わず、第7.1節の例に従います。旧環境の状態を読み取るだけの `diagnose-source` は、旧環境に書き込まないため、この2つには含みません。手順は第7.2節に書きます。

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

staging を使う場合、作業者は staging の完了後に production に異なる generation・リソース・source・identity を用意し、同じ順序を実施します。production のメンテナンス告知は担当者と内容を決め、送信承認後に行います。`deploy-worker` は active generation の通常更新用で、初回移行には使いません。

**OGP 画像の生成:** 移行時に存在する記事の OGP 画像は、データ移行の backfill が Node で生成して R2 に保存します。切替後に公開した記事の OGP 画像は、Worker が `/api/og/articles/<article-id>` への要求で生成します。Worker はこの要求で R2 の `og/<article-id>.png` を探し、あれば返します。無ければ、公開済みの記事に限り Worker が PNG を生成し、R2 の `og/<article-id>.png` に保存して返します。記事の公開時には生成しません。次の点に注意してください。

- 最初の要求では、Worker が生成を終えるまで応答が遅くなります。2 回目以降は、Worker が R2 の PNG をそのまま返します。
- 記事が無い場合と記事が未公開の場合、Worker は生成せず 404 を返します。
- R2 の読み取り、D1 の記事参照、フォント取得、描画のいずれかに失敗すると、Worker は 503 を返し、`Retry-After: 60` と `Cache-Control: public, max-age=60` を付けます。Worker は R2 に保存せず、失敗を Worker のログに記録します。
- Worker は、失敗した記事への要求に対して、失敗から 60 秒間は生成を試みず 503 を返します。この記録は Worker の isolate ごとのメモリにあり、isolate が変わると消えます。60 秒を過ぎた要求で、Worker が再び生成を試みます。
- 生成時に、Worker は Google Fonts の `fonts.googleapis.com` と `fonts.gstatic.com` から、タイトルの描画に必要な文字だけのフォントを取得します。Worker の外向きの通信先が増えます。
- 生成は Worker の CPU 時間を使います。`workers/iori/wrangler.template.jsonc` に `limits.cpu_ms` は無く、Worker は Workers Paid の既定値 30 秒の範囲で動く想定です。Workers Free の CPU 時間 10 ms には収まらない想定です。第1節のとおり、この移行は Workers Paid を前提とします。

**production 切替後の OGP 確認:** 第6.2節の `cutover-route` を production で実行して成功した後に、次を確認します。

1. R2 に `og/<article-id>.png` が無い公開済みの記事を1件選びます。
2. その記事について `/api/og/articles/<article-id>` を1回要求します。ブラウザでこの URL を開き、PNG が表示されることも確かめます。
3. 応答が 200 で、`Content-Type` が `image/png` であることを確認します。
4. R2 に `og/<article-id>.png` が保存されたことを確認します。

記録には pass/fail だけを残します。

### 6.3 cutover-route の失敗した段

`cutover-route` が失敗すると、公開ログに `IORI_DIAG stage=cutover-<段> program=none exit=none signal=none reason=<分類>` の行が出ます。plan を拒否したときは、この行の前に `plan-` で始まる詳細の行が最大8行出ます。`reason` が `state-mismatch` のときは、外れた条件を示す `resource-` で始まる行が最大8行出ます。語の意味は、[prepare-target の失敗した段](#prepare-target-の失敗した段)の `resource-` の表と同じです。行には固定の語だけが入り、メッセージの本文や ID は入りません。

どの段で止まった場合も、作業者は source の凍結を解かず、`cutover-route` を自動で再実行しません。作業者は、[cutover runbook の Rollback](./cloudflare-cutover-runbook.md#4-rollback)に従って、記録を残してレビューに戻します。

`cutover-queue-apply` 以降の段で止まった場合は、Queue の配送を再開した後の可能性があるので、作業者は「[7. 中断と引き継ぎ](#7-中断と引き継ぎ)」の表の「HTTP 有効化後」の行に従います。

`stage` の語彙と処理は、次のとおりです。

| `stage`                   | 処理                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `cutover-inputs`          | 入力と作業時間の上限の確認                                              |
| `cutover-main-check`      | レビュー済みの main の確認                                              |
| `cutover-restore`         | 移行データの復元と検証                                                  |
| `cutover-tf-init`         | Terraform の backend の初期化と既存の state の読み取り                  |
| `cutover-target-check`    | Terraform の出力と移行先の記録の照合                                    |
| `cutover-source`          | source の接続の準備                                                     |
| `cutover-gate-smoke`      | smoke への切り替えの前の確認（main、リソース、consumer、source の凍結） |
| `cutover-to-smoke`        | Worker を smoke に切り替える                                            |
| `cutover-smoke-worker`    | workers.dev での smoke                                                  |
| `cutover-gate-route`      | route の作成の前の確認                                                  |
| `cutover-read-smoke`      | route の作成の前のリソースの読み取り                                    |
| `cutover-route-plan`      | route の plan と検査                                                    |
| `cutover-route-apply`     | route の apply                                                          |
| `cutover-read-route`      | route の作成の後のリソースの読み取り                                    |
| `cutover-smoke-canonical` | 公開ホスト名での smoke                                                  |
| `cutover-gate-active`     | active への切り替えの前の確認                                           |
| `cutover-to-active`       | Worker を active に切り替える                                           |
| `cutover-gate-queue`      | Queue の配送の再開の前の確認                                            |
| `cutover-read-active`     | Queue の配送の再開の前のリソースの読み取り                              |
| `cutover-queue-plan`      | Queue の配送の再開の plan と検査                                        |
| `cutover-queue-apply`     | Queue の配送の再開の apply                                              |
| `cutover-read-resume`     | 配送の再開の後の consumer と Worker の読み取り                          |
| `cutover-smoke-final`     | 最後の smoke                                                            |
| `cutover-unclassified`    | 上のどれにも当たらない段                                                |

`reason` には、[prepare-target の失敗した段](#prepare-target-の失敗した段)の表と同じ語が出ます。`cutover-route` だけに出る語は、次のとおりです。

| `reason`                     | 意味                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `reviewed-main-required`     | レビュー済みの main が指定されていません。                                     |
| `reviewed-checkout-mismatch` | checkout がレビュー済みの main と一致しません。                                |
| `reviewed-checkout-dirty`    | checkout に未 commit の変更があります。                                        |
| `reviewed-main-changed`      | 実行中に main が変わりました。                                                 |
| `job-budget-exhausted`       | job の作業時間の上限に達しました。                                             |
| `smoke-failed`               | smoke の検査が失敗しました。                                                   |
| `verify-failed`              | 移行データの検証が失敗しました。                                               |
| `deploy-failed`              | レビュー済みの Worker の version の deploy が失敗しました。                    |
| `source-not-quiescent`       | source の凍結、drain、identity のどれかを確認できません。                      |
| `mismatch`                   | 移行先の記録、consumer、または配送の再開の後の consumer が期待と一致しません。 |

`cutover-source` と `cutover-gate-*` では、source の接続の失敗として `not-ready`、`busy`、`rejected`、`invalid-response`、`spawn-failed`、`ssh-failed` と、`estimate-` で始まる語が出ます。意味は、[estimate-source で事前に確認する](#estimate-source-で事前に確認する)の `reason` の表に書いています。

## 7. 中断と引き継ぎ

| 中断地点                      | 維持する状態                            | 次の対応                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認証・保護・source 診断で停止 | 稼働中 source を維持                    | 未確認項目・拒否された操作・必要な担当者を記録                                                                                                                                                                                                                                                                       |
| 準備の結果が不明              | 部分生成した generation と state を保持 | 実 readback で状態を特定。`stage=prepare-<段>` の行を見て、[prepare-target の失敗した段](#prepare-target-の失敗した段)の表で判断する。generation を再利用して自動再実行しない（generation のリソースが1つも無く、backend bucket の state の場所に object も無い場合を除く。[VAPID 値の確認](#vapid-値の確認)を参照） |
| 凍結後、HTTP 有効化前         | Source の凍結、予約、部分 import を保持 | 移行先書き込みが未有効であることを確認し、明示承認した復旧だけを実施                                                                                                                                                                                                                                                 |
| HTTP 有効化後                 | 旧 source を凍結したまま保持            | 移行先での復旧を優先し、差分を照合するまで旧 source を再開しない                                                                                                                                                                                                                                                     |
| cutover-route が止まった      | 旧 source を凍結したまま保持            | source の凍結を保ち、[cutover-route の失敗した段](#63-cutover-route-の失敗した段)の `stage` と `reason` を記録して、レビューに戻します。`cutover-queue-apply` 以降の段で止まった場合は、HTTP 有効化後の行に従います。                                                                                                |

具体的な復旧条件は [cutover runbook の Rollback](./cloudflare-cutover-runbook.md#4-rollback)に従います。`reconcile-resources` と `replace-queue-consumer` は現行 workflow が権限使用前に拒否する保守用の未提供操作です。復旧の代用として dispatch しません。

完了後も14日間の監視・保持を続け、AWS retirement は保持証跡と destroy plan のレビュー・明示承認後の別作業とします。実行者は「最後に成功した段階」「確認済みの現在状態」「次の操作」「必要な承認」を残し、次の担当者が同じ run の続行と新規移行を取り違えないようにします。

### 7.1 凍結が残った場合の復旧

凍結の前に失敗した場合、作業者は Deploy iori を同じ SHA で再実行します。

凍結が残る状態は2つあります。

- `~/.iori-migration/freeze.json` が残り、source が凍結したままの状態です。
- `freeze.pending` が残り、source が status と resume を `invalid_freeze_state` で拒否する状態です。

`freeze.pending` は rename の前の状態です。このため、凍結はまだ成立しておらず、export も始まっていません。

旧環境への操作は、`resume-source`、`release-pending-freeze`、`restart-failed-source` の3つの operation からだけ行います。作業者は旧環境に直接入って `freeze.json` や `freeze.pending` を消しません。

#### `freeze.json` が残った場合

作業者は `resume-source` を dispatch します。input は次の4つです。

- `main_sha`: 現在の main の SHA
- `migration_main_sha`: 凍結した run の `main_sha`
- `migration_run_id`: 凍結した run の `run_id`
- `recovery`: 移行先の書き込み状況

このほかに、`operation` に `resume-source` を指定します。`environment` と `generation` には、凍結した run と同じ値を入れます。

```bash
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha='<現在の main の SHA>' \
  -f migration_main_sha='<凍結した run の main_sha>' \
  -f operation=resume-source \
  -f environment='<凍結した run の environment>' \
  -f generation='<凍結した run の generation>' \
  -f migration_run_id='<凍結した run の run_id>' \
  -f recovery='<destination_writes_not_enabled または destination_writes_reconciled>'
```

`recovery` に既定値はありません。作業者は次のとおりに値を選びます。自動処理は `recovery` の値を推測しません。

- 移行先に通常の書き込みを有効にしていないと確認できたときだけ、`destination_writes_not_enabled` を入力します。
- HTTP を有効にした後に D1 / R2 へ書き込みがあった場合、作業者は照合と反映が済むまで resume しません。済んだら `destination_writes_reconciled` を入力します。

`resume-source` は次の順に動きます。

1. resume を送る前に、status で source が凍結していること、source が idle であること、凍結の identity が input と一致することを確かめます。
2. 条件を満たさない場合は、resume を送らずに失敗します。
3. 条件を満たした場合は、resume を送ります。
4. resume の後に、status で凍結が解けたことを確かめます。

source 側の処理が終わった状態を、source は idle と呼びます。source は、status の次の3項目がすべて 0 のときに idle と判定します。

- `http_inflight`: 0
- `dequeue_work`: 0
- `enqueue_work`: 0

`queue_failed` が true の場合、source は resume を拒否します。`resume-source` は、`queue_failed` が true の場合、resume を送らずに `reason=source-queue-failed` で失敗します。この場合、作業者は `restart-failed-source` で microblog を再起動してから、`resume-source` をやり直します。手順は[`queue_failed` で resume できない場合](#queue_failed-で-resume-できない場合)に書きます。

次の項目は、source 側の処理が終わった証拠として使いません。

- `consumer_paused`: true は、queue の取り出しが止まり、実行中のハンドラがないことだけを示します。`consumer_paused` は `enqueue_work` と `http_inflight` を含みません。
- `drained`: drain が成功した後だけ true になります。freeze、resume、drain の開始、コマンドの失敗のどれかで false に戻ります。
- `ingress_frozen`: 凍結中かどうかを示します。処理が終わったかどうかとは関係しません。

export、inventory、transfer などの control コマンドが実行中の間、source は status を含むすべての control コマンドを拒否します。このとき status は値を返しません。status の項目では、実行中の control コマンドを観測できません。

`resume-source` は、次の3つの場合に resume を送らずに失敗します。

- export などの control コマンドが実行中の間は、source が status を拒否します。`resume-source` は、status が拒否されると `stage=resume-precheck` で失敗します。拒否の理由が control コマンドの実行中であれば `reason=source-not-idle` になります。それ以外の理由で拒否された場合は `reason=source-operation-failed` になります。
- status が値を返し、`queue_failed` が true の場合、`resume-source` は `stage=resume-precheck` で `reason=source-queue-failed` として失敗します。作業者は `restart-failed-source` で再起動してから、`resume-source` をやり直します。
- status が値を返し、`queue_failed` が false で、`http_inflight`、`dequeue_work`、`enqueue_work` のどれかが 0 でない場合、`resume-source` は `stage=resume-precheck` で `reason=source-not-idle` として失敗します。

`resume-source` は idle になるまで待つ処理を持ちません。失敗した場合、作業者は次のとおり対応します。

- `queue_failed` が true で `reason=source-queue-failed` の場合、`resume-source` では復旧できません。source の queue の失敗は、凍結の marker を残したまま再起動しないと解消しません。凍結の marker がある間は、source 配備も止まります。作業者は `restart-failed-source` を dispatch して microblog を再起動し、成功を確認してから `resume-source` をやり直します。手順は次の節に書きます。
- `reason=source-operation-failed` の場合、作業者は時間を置いて1〜2回再実行します。それでも同じ reason で失敗する場合、作業者は別の原因を疑います。revision の不一致、identity の不一致、ssh の失敗が、この reason になります。identity の main_sha や run_id が input と違う場合は、ssh アダプタが先に検出するので、reason は `source-operation-failed` になります。source が凍結しているのに identity を持たない場合は、`reason=source-identity-mismatch` で失敗します。
- `reason=source-not-idle` の場合、`http_inflight`、`dequeue_work`、`enqueue_work` のどれかが 0 でなく、HTTP や queue の作業が残っています。export などの control コマンドが実行中で、source が status か resume を拒否した場合も、この reason になります。作業者は時間を置いて再実行します。
- resume が source 側で成功したのに応答が届かなかった場合、`resume-source` は失敗として報告します。再実行すると `reason=source-not-frozen` で失敗します。`source-not-frozen` は、凍結がすでに解除済みである可能性を示します。作業者は status か本番の応答で、凍結が解けていることを確かめます。

rehearse-migration は、30 分の上限で中断した直後に resume を1回試します。このとき source 側の export がまだ動いていると、source は resume を拒否し、凍結が残ります。この状態で作業者が `resume-source` を dispatch すると、`reason=source-not-idle` で失敗します。export などの control コマンドが実行中の場合も、control コマンドは終わっていて HTTP や queue の処理が残っている場合も、reason は同じです。どちらの場合も、作業者は上の対応に従います。

#### `queue_failed` で resume できない場合

`resume-source` が `reason=source-queue-failed` で失敗した場合、作業者は `restart-failed-source` を dispatch します。この operation は microblog を停止して起動し直します。

`restart-failed-source` は、次の3つの前提がそろわないと、旧環境を変えずに失敗します。

- `freeze.json` があります。
- `freeze.pending` がありません。
- status の `queue_failed` が true です。

`queue_failed` は microblog を再起動するまで true のまま残ります。このため、`restart-failed-source` は旧環境側で `queue_failed` を確かめ直しません。

input は `main_sha`、`migration_main_sha`、`migration_run_id` です。`environment` と `generation` には、凍結した run と同じ値を入れます。`recovery` は渡しません。渡すとエラーになります。

```bash
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha='<現在の main の SHA>' \
  -f migration_main_sha='<凍結した run の main_sha>' \
  -f operation=restart-failed-source \
  -f environment='<凍結した run の environment>' \
  -f generation='<凍結した run の generation>' \
  -f migration_run_id='<凍結した run の run_id>'
```

`restart-failed-source` は次の順に動きます。

1. status を読み、次の4項目を Actions ログに出します。この行は microblog を触る前の状態を示します。
   `IORI_NOTICE stage=restart-precheck ingress_frozen=<0|1> consumer_paused=<0|1> queue_failed=<0|1> drained=<0|1>`
2. 旧環境で `freeze.json` と再起動の記録を確かめ、sudo の許可を事前に検査します。条件を満たさなければ、記録を書かず microblog も停止せずに失敗します。
3. 再起動の記録を `~/.iori-migration/queue-failed-restart.json` に書きます。書き終えると `IORI_NOTICE stage=restart-failed-source recorded=1` を出します。
4. microblog を停止します。停止を確かめると `IORI_NOTICE stage=restart-failed-source stopped=1` を出します。
5. microblog を起動します。起動すると `IORI_NOTICE stage=restart-failed-source started=1` を出します。
6. status が応答するまで、約2分を上限に待ちます。応答した status が次の4つの条件をすべて満たすかを確かめます。
   - `ingress_frozen` が true です。
   - `consumer_paused` が true です。
   - `queue_failed` が false です。
   - identity が input と一致します。

`restart-failed-source` は `freeze.json` を消しません。resume も自動では送りません。作業者は手順 6 の成功を Actions ログで確認してから、`freeze.json` が残った場合の手順で `resume-source` を dispatch します。

失敗した場合、作業者は Actions ログの `IORI_DIAG` 行の `stage` と `reason` を確認します。`reason` ごとに、作業者は次のとおり対応します。

- `source-queue-not-failed` の場合（`stage=restart-precheck`）、status の `queue_failed` が false です。再起動する対象ではありません。作業者は `resume-source` を dispatch します。
- `freeze-not-committed` の場合、`freeze.json` がありません。凍結はまだ成立していません。作業者は旧環境に入らず、管理役に判断を戻します。
- `freeze-invalid` の場合、`freeze.json` が読めないか、形式が正しくありません。作業者は旧環境に入らず、管理役に判断を戻します。
- `pending-freeze-present` の場合、`freeze.pending` が残っています。作業者は `release-pending-freeze` の手順に従います。
- `freeze-identity-mismatch` の場合、input の `migration_main_sha` か `migration_run_id` が、`freeze.json` の `main_sha` か `run_id` と違います。作業者は input を凍結した run の値に直して、再実行します。
- `invalid-restart-operation` の場合、作業者は dispatch の input を見直してから再実行します。
- `restart-record-invalid` と `restart-record-failed` の場合、作業者は旧環境に入らず、管理役に判断を戻します。前回の実行で記録の書き込みが途中で失敗した場合も、`restart-record-invalid` になります。
- `service-control-not-permitted` の場合、記録を書く前に失敗しています。microblog は止まっておらず、記録も残っていません。作業者は旧環境に入らず、管理役に判断を戻します。管理役が許可を直した後は、再実行できます。
- `service-stop-failed` と `service-not-stopped` の場合、記録を書いた後に失敗しています。microblog が停止したまま残る場合があります。再実行は `restart-already-attempted` で拒否されます。作業者は旧環境に入らず、管理役に判断を戻します。
- `service-start-failed` の場合、記録を書いた後に失敗しています。再実行は `restart-already-attempted` で拒否されます。microblog が停止したまま残ると、本番の配信が止まります。CI から start だけを行う operation はありません。作業者は旧環境に入らず、すぐに管理役に連絡します。
- `restart-not-confirmed` の場合（`stage=restart-verify`）、応答した status が手順 6 の条件を満たしませんでした。記録が残っているので、再実行は拒否されます。作業者は旧環境に入らず、管理役に判断を戻します。
- `stage=restart-precheck` で `source-operation-failed` か `source-control-not-ready` になった場合、status を読めずに、旧環境を変える前に失敗しています。記録も残っていません。作業者は Actions ログで原因を確かめてから、再実行できます。原因には、control コマンドの実行中、ssh の失敗、identity の不一致などがあります。
- `stage=restart-verify` で `source-control-not-ready` か `source-operation-failed` になった場合、microblog を起動した後に失敗しています。`source-control-not-ready` は、約2分以内に status が応答しなかったことを示します。記録が残っているので、再実行は拒否されます。作業者は旧環境に入らず、管理役に判断を戻します。
- `restart-already-attempted` の場合、同じ凍結の記録がすでにあります。作業者は旧環境に入らず、管理役に判断を戻します。

再起動の記録は、`~/.iori-migration/queue-failed-restart.json` に1つだけ置きます。`restart-failed-source` は、記録を次の2つの場合に分けて扱います。

- 記録の `main_sha` と `run_id` が `freeze.json` と同じ場合、記録は同じ凍結のものです。2回目の実行は `reason=restart-already-attempted` で拒否されます。
- 記録が以前の凍結のもの、つまり identity が違う場合、`restart-failed-source` は次回の実行時に記録を削除して、新しい記録に置き換えます。

作業者は記録を手作業で消しません。

#### `freeze.pending` が残った場合

作業者は `release-pending-freeze` を dispatch します。input は `main_sha`、`migration_main_sha`、`migration_run_id` です。`environment` と `generation` には、凍結した run と同じ値を入れます。`recovery` は渡しません。

```bash
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha='<現在の main の SHA>' \
  -f migration_main_sha='<凍結した run の main_sha>' \
  -f operation=release-pending-freeze \
  -f environment='<凍結した run の environment>' \
  -f generation='<凍結した run の generation>' \
  -f migration_run_id='<凍結した run の run_id>'
```

次の手順は、初回の実行の動きです。再実行の動きは、手順の後に書きます。

`release-pending-freeze` は次の順に動きます。

1. microblog を停止する前に、`freeze.json` が無いこと、`freeze.pending` が通常ファイルで同じ uid の所有であること、`freeze.pending` の中身の `main_sha` と `run_id` が input の `migration_main_sha` と `migration_run_id` に一致すること、退避先の `freeze.pending.rejected-<migration_run_id>` が無いことを確かめます。条件を満たさなければ、microblog を停止せずに失敗します。`release-pending-freeze` は、旧環境の systemctl の絶対パスを確かめ、そのパスで許可の検査と、stop と start の実行を行います。`sudo -n -l` で、microblog の stop と start が許可されていることを確かめます。許可されていない場合は `reason=service-control-not-permitted` で、microblog を停止せずに失敗します。
2. microblog を停止し、停止したことを確かめます。
3. 停止したあとに、手順 1 と同じ条件をもう一度確かめます。あわせて、`freeze.pending` が手順 1 で確かめたファイルと同じファイルであることを確かめます。停止の間にファイルが変わっていた場合は、失敗します。
4. 手順 3 の条件を満たした場合だけ、`freeze.pending` を退避します。`freeze.pending` の中身は消さず、`freeze.pending.rejected-<migration_run_id>` という hard link を作ってから、`freeze.pending` の名前を外します。退避先がすでにある場合は、上書きせずに失敗します。
5. microblog を起動し、status で凍結していないことを確かめます。

条件を満たさない場合、`release-pending-freeze` はそれ以降の操作をせずに失敗します。手順 1 で失敗した場合、`release-pending-freeze` は microblog を停止していません。手順 2 の停止のあとに、手順 3 の再検査、手順 4 の退避、手順 5 の起動のどこかで失敗した場合は、microblog が停止したまま残る場合があります。作業者は Actions ログの `IORI_DIAG` 行の `stage` と `reason` を確認します。

`reason` ごとに、作業者は次のとおり対応します。

- `service-stop-failed`、`service-not-stopped`、`release-rename-failed` の場合、作業者は原因を確かめてから `release-pending-freeze` を再実行します。microblog が停止したまま残っている場合があります。
- `release-pending-freeze` は、microblog の停止を確かめた直後に、Actions ログへ `IORI_NOTICE stage=release-pending-freeze stopped=1` を出します。失敗した場合、作業者は失敗より前にこの行が出ているかを確かめます。
  - `reason` が停止前の検査で起きる5つ（`freeze-committed`、`pending-freeze-invalid`、`pending-identity-mismatch`、`release-target-exists`、`service-control-not-permitted`）のどれかで、失敗より前に `stopped=1` の行が出ていない場合は、停止前の検査で失敗しています。旧環境は変わっておらず、microblog も止まっていません。この場合、再実行しても同じ理由で失敗し続けます。作業者は再実行せず、承認を得て `freeze.pending` と退避先の状態を確かめます。
  - `service-stop-failed` と `service-not-stopped` は、停止を試みたあとの失敗です。この2つの場合、`stopped=1` の行は出ませんが、microblog が止まっている場合があります。作業者は上の項目のとおり、原因を確かめてから再実行します。
  - 凍結が残っていないのに dispatch した場合も、停止前の検査で `pending-freeze-invalid` として失敗します。
  - `service-control-not-permitted` は旧環境を変えません。再実行しても直りません。作業者は承認を得て、旧環境の sudoers を確かめます。
- `stopped=1` の行が出たあとの停止後の再検査が `freeze-committed`、`pending-freeze-invalid`、`pending-identity-mismatch`、`release-target-exists` のどれかで失敗した場合は、作業者は原因を確かめてから `release-pending-freeze` を再実行します。microblog が停止したまま残っている場合があります。
- `service-start-failed`、`release-not-confirmed` の場合、作業者は `release-pending-freeze` を再実行します。再実行は退避済みとして扱われ、起動と確認だけを行います。

再実行したときの事前検査で、次の3つの条件がそろうことがあります。

- `freeze.json` も `freeze.pending` もありません。
- `freeze.pending.rejected-<migration_run_id>` が通常ファイルで、同じ uid が所有しています。
- その中身の `main_sha` と `run_id` が input と一致します。

この場合、`release-pending-freeze` は退避済みとして扱います。停止と退避を飛ばし、microblog を起動して、status で凍結していないことを確かめます。この経路でも、`release-pending-freeze` は stop と start の両方の許可を確かめます。Actions ログには `IORI_NOTICE stage=release-pending-freeze already_renamed=1` が出ます。

退避の途中で失敗した場合は、`freeze.pending` と退避先の両方が同じファイルとして残ります。再実行すると、`release-pending-freeze` は microblog を停止して確かめ直してから、`freeze.pending` の側だけを取り除き、microblog を起動します。

空の `freeze.pending` や書きかけの `freeze.pending` は、identity を確かめられないので、`release-pending-freeze` は `pending-freeze-invalid` で失敗します。この場合、作業者は承認を得て手作業で判断します。

### 7.2 旧環境の状態を読み取る

`diagnose-source` は、旧環境の状態を読み取って、結果を Actions ログへ1行で出す operation です。旧環境のコマンド出力は公開ログに出ないので、旧環境が 502 を返しても、原因の見当がつかない場合があります。作業者は、そのような場合に `diagnose-source` を使います。

`diagnose-source` は読み取り専用です。microblog の stop、start、restart、旧環境へのファイルの書き込み、`freeze.json` と `freeze.pending` の操作を、`diagnose-source` は行いません。

input は `main_sha`、`operation`、`environment` の3つです。`main_sha` には現在の main の SHA を指定します。ほかの operation と同じ検査が、`main_sha` に対して働きます。`migration_main_sha`、`generation`、`migration_run_id`、`recovery` は空にします。`generation`、`migration_run_id`、`recovery` を渡すと、workflow は権限を使う前に失敗します。

```bash
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha='<現在の main の SHA>' \
  -f operation=diagnose-source \
  -f environment=production
```

job は `resume-source` と `release-pending-freeze` と同じ job で動きます。job が受け取る secret は、旧環境への SSH に使う4つだけです。production では Environment の承認が必要です。

`diagnose-source` は、旧環境の node で読み取りの処理を実行して、Actions ログへ次の1行を出します。

```text
IORI_NOTICE stage=source-diagnose active=failed sub=auto-restart restarts=12 exit_status=1 journal=module-not-found freeze=0 freeze_pending=0 mem_available_mb=312 disk_free_mb=5120 source_revision=<40桁の16進> active_enter=20261101T0612Z journal_window_h=6 journal_truncated=0 exits=3 scheduled_restarts=2 jc_module_not_found=3 jc_syntax_error=0 jc_env_invalid=0 jc_port_in_use=0 jc_out_of_memory=0 jc_permission_denied=0 jc_database_unavailable=0 jc_uncaught_exception=0
```

| 項目                                                                                                                                                | 値                                                                                                                                                                                   | 意味                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active`                                                                                                                                            | `active`、`inactive`、`failed`、`activating`、`deactivating`、`reloading`、`maintenance`、`refreshing`、`other`                                                                      | `systemctl show microblog` の `ActiveState`。上の語彙に無い値は `other`                                                                                                                                                                                                                                                                                       |
| `sub`                                                                                                                                               | `running`、`dead`、`exited`、`failed`、`auto-restart`、`start`、`stop` など systemd の既知の値と `other`                                                                             | `systemctl show microblog` の `SubState`。語彙に無い値は `other`                                                                                                                                                                                                                                                                                              |
| `restarts`                                                                                                                                          | 0 から 999999 の整数                                                                                                                                                                 | `NRestarts`。上限を超える値は 999999 にします。`systemctl restart` などの明示的な restart で、`NRestarts` は 0 に戻ります                                                                                                                                                                                                                                     |
| `exit_status`                                                                                                                                       | 0 から 255 の整数                                                                                                                                                                    | `ExecMainStatus`。上限を超える値は 255 にします                                                                                                                                                                                                                                                                                                               |
| `journal`                                                                                                                                           | `none`、`module-not-found`、`syntax-error`、`env-invalid`、`port-in-use`、`out-of-memory`、`permission-denied`、`database-unavailable`、`uncaught-exception`、`other`、`unavailable` | 過去 6 時間の journal の中で、最後の失敗した終了の行の直前にあった分類。失敗した終了の行が無ければ `none` です。直前に具体的な規則の行もスタックも無い場合は `other` です。読めない場合は `unavailable` です                                                                                                                                                  |
| `freeze`                                                                                                                                            | 0 または 1                                                                                                                                                                           | `~/.iori-migration/freeze.json` の有無                                                                                                                                                                                                                                                                                                                        |
| `freeze_pending`                                                                                                                                    | 0 または 1                                                                                                                                                                           | `~/.iori-migration/freeze.pending` の有無                                                                                                                                                                                                                                                                                                                     |
| `mem_available_mb`                                                                                                                                  | 整数（MB）                                                                                                                                                                           | `/proc/meminfo` の `MemAvailable`                                                                                                                                                                                                                                                                                                                             |
| `disk_free_mb`                                                                                                                                      | 整数（MB）                                                                                                                                                                           | home があるファイルシステムの空き                                                                                                                                                                                                                                                                                                                             |
| `source_revision`                                                                                                                                   | 40桁の16進、または `unknown`                                                                                                                                                         | 配置済みの `dist/index.js` に焼き込まれた revision。1つに決まらない場合は `unknown`                                                                                                                                                                                                                                                                           |
| `active_enter`                                                                                                                                      | `YYYYMMDDTHHMMZ`（UTC、分単位）、または `unknown`                                                                                                                                    | `systemctl show microblog --property=ActiveEnterTimestamp --timestamp=unix` の値。microblog が最後に active になった時刻です。読めない場合、解析できない場合、systemd が `--timestamp=unix` を受け付けない場合は `unknown` です                                                                                                                               |
| `journal_window_h`                                                                                                                                  | 常に 6                                                                                                                                                                               | journal を読む時間窓（時間）。窓は固定で、workflow の input にはできません                                                                                                                                                                                                                                                                                    |
| `journal_truncated`                                                                                                                                 | 0 または 1                                                                                                                                                                           | 窓の journal が出力の上限を超え、読めた範囲だけで集計した場合は 1 です。1 のときは、journalctl が古い行から出力するため窓の新しい側が欠けており、`journal=` と件数は読めた古い側だけの値です                                                                                                                                                                  |
| `exits`                                                                                                                                             | 0 から 999999 の整数                                                                                                                                                                 | 窓の中で、失敗した終了の回数。`Main process exited` の行のうち、`code=exited` で `status` が 0 以外のもの、`code=killed` のもの（`status=15/TERM` による計画的な停止を除く）、`code=dumped` のものを数えます                                                                                                                                                  |
| `scheduled_restarts`                                                                                                                                | 0 から 999999 の整数                                                                                                                                                                 | 窓の中で `Scheduled restart job` を含む行の数                                                                                                                                                                                                                                                                                                                 |
| `jc_module_not_found`、`jc_syntax_error`、`jc_env_invalid`、`jc_port_in_use`、`jc_out_of_memory`、`jc_permission_denied`、`jc_database_unavailable` | 0 から 999999 の整数                                                                                                                                                                 | 窓の中で、それぞれの規則に当たった行の数。1行は、最初に当たった1つの分類にだけ数えます                                                                                                                                                                                                                                                                        |
| `jc_uncaught_exception`                                                                                                                             | 0 から 999999 の整数                                                                                                                                                                 | 窓の中で、失敗した終了（`Failed with result` の行、または `exits` に数える `Main process exited` の行）の直前 30 行に、スタックフレーム（`at`）か `Uncaught` があり、同じ範囲に具体的な規則の行が無い失敗した終了の行の数。失敗した終了の行1つにつき1回だけ数えます。動いているプロセスが出したスタック付きのログは、失敗した終了の行が続かなければ数えません |

`journal=` の意味は、以前の「直近 200 行の分類」から、「過去 6 時間の窓の中で、最後の失敗した終了の行の直前にあった分類」に変わりました。`restarts` は、`NRestarts` をそのまま示すので、明示的な restart で 0 に戻ります。障害の回数は、`exits` と `scheduled_restarts` で確認します。`journal=unavailable` のときは、`journal_truncated`、`exits`、`scheduled_restarts`、`jc_*` をすべて 0 で出します。

journal の生の行、パス、ホスト名、秘密値は、公開ログにも private ログにも出ません。旧環境側の処理が journal を読んで件数と分類だけを返し、生の行は旧環境の外に出ません。

journal の読み取りは、次の順に試します。`diagnose-source` は、新しい sudoers の設定を前提にしません。

1. `sudo -n -l` で、`journalctl -u microblog --since=-6h --no-pager -o cat` が許可されているかを確かめます。許可されていれば、`sudo -n` でそのコマンドを実行します。
2. 許可されていない場合、または sudo での実行に失敗した場合は、sudo なしで同じコマンドを実行します。
3. どちらも読めない場合、または journalctl が権限不足を報告した場合は、`journal=unavailable` を出します。この場合も、operation は成功します。

`diagnose-source` の成功の条件は、値を集めて1行を出せたことです。microblog が `failed` でも、operation は成功します。旧環境へ接続できない場合や、`systemctl show` を読めない場合は失敗し、`IORI_DIAG` の行に `stage` と `reason` が出ます。`reason=diagnostic-invalid` は、旧環境で読んだ値が想定の形ではなかったことを示します。`IORI_NOTICE` の行が出ていれば、job が失敗していても、作業者はその行の値を読めます。`IORI_NOTICE` の行が出ていなければ、作業者は `IORI_DIAG` の行の `reason` を見ます。

`source_revision` は、dist の中の40桁の16進の文字列が1つだけのときに限って値になります。この読み方は、dist を最後にビルドしたときの revision を示します。実行中のプロセスが返す `source_revision` とは別の経路です。
