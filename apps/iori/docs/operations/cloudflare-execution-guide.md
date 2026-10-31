# Cloudflare 移行の実行手順

作業者はこの手順で認証・Environment・source・リハーサルを準備し、[cutover runbook](./cloudflare-cutover-runbook.md)の順序で切り替えます。public repository と GitHub-hosted `ubuntu-latest` を使います。以下のコマンドを一括実行せず、各段階の完了条件を確認して進めてください。

## 0. 現在地と作業記録

2026-09-06 の実行前調査で確認した状態です。再開時は再確認してください。この文書の更新によって設定・配備・移行が実施済みになるわけではありません。

| 対象               | 確認結果                                                                                                       | 次の作業                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 実装               | [Draft PR #486](https://github.com/iwasa-kosui/monorepo/pull/486)。`e49ab0e` の CI は全4ジョブ成功             | 最新の PR head をレビューし、明示承認後に merge |
| SSH                | `microblog` への既存認証と厳密な host-key 検証で `true` が成功                                                 | source の詳細診断                               |
| Source             | 稼働状態、SHA、固定 Node/pnpm、freeze marker、容量は未確認                                                     | 第4節の確認表を埋める                           |
| Cloudflare         | Dashboard とローカル Wrangler は未認証                                                                         | 第1節のログインと権限設定                       |
| GitHub Environment | `staging` は保護ブランチ方式で reviewer なし。`production` は reviewer 1件、branch 制限なし。`main` は保護済み | 第2節の不足設定と readback                      |
| Secrets            | 新 workflow の35参照名のうち31名が不足。既存名の存在は値・権限の適合を保証しない                               | 第3節の入力を Environment ごとに準備            |
| 実移行             | source の停止・凍結、resource 作成、import、route 切替は未実施                                                 | staging の完了後に production を開始            |

事前調査で拒否された操作は、当時の GitHub 保護設定変更案、source 診断スクリプトのローカル作成、直接 HTTP 取得です。その後、ユーザーが保護ブランチ方式を選択しました。上表の Environment と `main` の状態は、この選択後の API 読み戻しを反映しています。今回エージェントが設定変更を実行したわけではありません。source 診断など未実行の操作は、許可された端末で実施し、拒否された操作を別ツールで迂回しません。

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

`production` と `staging` の両方で、ユーザーが選択した `protected_branches` 方式を使います。required reviewer の設定と、後続 job の実行承認も記録してください。

| 設定                         | 今回の設定案                                                |
| ---------------------------- | ----------------------------------------------------------- |
| Required reviewers           | `iwasa-kosui`                                               |
| Wait timer                   | 0分                                                         |
| Prevent self-review          | 無効。起動者本人による承認を許可                            |
| Deployment branches and tags | Protected branches only                                     |
| API の branch policy         | `protected_branches: true`, `custom_branch_policies: false` |
| Repository の前提            | `main` に branch protection を設定                          |

GitHub repository の **Settings → Environments** で設定します。既に別の保護規則が追加されている場合は、この表で上書きせず差分を確認します。本人による承認を禁止する方針なら、別の承認者を決めてから設定案を変更します。

設定後、各 Environment の読み戻しを行います。最初は `staging`、次に変数を `production` に変更して Environment の確認を繰り返します。`main` の保護状態も確認します。

```bash
iori_environment=staging
gh api "repos/$iori_repo/environments/$iori_environment" \
  --jq '{rules: [.protection_rules[] | {type, wait_timer, prevent_self_review, reviewers: [.reviewers[]? | .reviewer.login]}], policy: .deployment_branch_policy}'
gh api "repos/$iori_repo/branches/main" --jq '{name, protected}'
```

**完了条件:** 両 Environment に required reviewer が存在し、`protected_branches=true`、`custom_branch_policies=false`。`main` は branch protection が有効で、API の `protected` が `true`。個別の deployment branch policy は作成しません。

Environment は保護されたブランチを許可し、`main` だけに限定するものではありません。対象を `main` に固定するのは、source/Worker workflow の `GITHUB_REF=refs/heads/main` と最新 main SHA の一致検査です。この2つの制御を維持します。repository に branch protection rule が1件もない場合、Protected branches only でも全ブランチが許可されるため、Environment の設定だけで完了としません。[GitHub の deployment branch 制限](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags)

source deploy は対象 path の `main` push でも起動します。**source credential の供給と merge より前に、この保護を完了してください。** Ready 化・merge は明示承認後に行い、merge により起動した source job は第4節の前提が揃うまで承認しません。

## 3. 移行先と Environment inputs の準備

### 3.1 Backend と用途別 credential

1. 移行用の Terraform state bucket を別途作成します。アプリ画像用・移行 bundle 用 bucket と共有せず、既存 state を移動しません。
2. 新しい staging generation と run ID を選び、非公開の作業記録に固定します。generation は先頭が小文字英字の8〜20文字の小文字英数字、run ID は英数字・`_`・`-` の1〜80文字です。
3. [infra の操作別権限表](../../infra/cloudflare/README.md#environment-references)に従い、5用途の Cloudflare API token と、state・transfer・application 各用途の読み書き用／読み取り専用 S3 credential を分けます。
4. S3 credential は対象 bucket に限定します。新規 bucket は `prepare-target` が作るため、transfer の書き込み権限は未作成の予定名へ事前に限定する必要があります。Dashboard では既存の bucket しか選べないので、transfer の書き込み token は「[未作成の bucket に限定した R2 S3 credential の作成](#未作成の-bucket-に限定した-r2-s3-credential-の作成)」の手順で作ります。手動で target bucket を先に作ると fresh-generation 検査に失敗します。
5. Account の `workers.dev` subdomain を Dashboard で確認し、未登録なら `prepare-target` より前に登録します。staging の Worker hostname は `iori-staging-<generation>.<登録済みsubdomain>.workers.dev`、production は同じ形で environment 部分を `production` にします。固定 Wrangler の非対話 deploy に初回登録を任せると、リソース作成後に失敗して部分 generation が残るため、hosted job では登録しません。[workers.dev の設定](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)を参照してください。

R2 の S3 credential と Cloudflare REST API token は別に扱います。作成方法・bucket scope は [R2 認証手順](https://developers.cloudflare.com/r2/api/tokens/)を参照してください。API token の実際の permission と readback API の適合も確認します。通常の広い token を全 role に流用して完了扱いにしません。

### 未作成の bucket に限定した R2 S3 credential の作成

**前提と対象**

- この小節は、transfer bucket と application bucket の S3 credential だけを扱います。state 用の `IORI_TERRAFORM_*` は既存の backend bucket が対象なので、Dashboard の R2 token 作成画面で作れます。
- Dashboard の R2 token 作成画面では、既存の bucket しか選べません。2026-10-31 に確認しました。未作成の名前を入力すると「No matching buckets」と表示されます。
- transfer bucket と application bucket は、`prepare-target` が Terraform で作ります。手動で bucket を作ると fresh-generation 検査に失敗するので、手動では作りません。
- bucket 名は `infra/cloudflare/main.tf` の `generation_prefix` から決まります。transfer bucket の名前は `iori-<environment>-<generation>-transfer` で、application bucket の名前は `iori-<environment>-<generation>-uploads` です。
- run ID は bucket 名にも token の範囲にも入りません。run ID が入るのは transfer bucket の中の key prefix だけです。このため、token の作成は run ID の確定を待ちません。
- token の範囲は bucket 名で限定されます。このため、generation ごとに token を作り直します。新しい generation の secret を登録した後に、古い generation の子 token を削除します。

**ユーザーと作業者の分担**

- 親 token の値は、作成ボタンを押した後の Dashboard の画面に表示されます。親 token は Account API Tokens Edit を持つので、ほかの token を発行できます。
- ユーザーが、次の 2 つを行います。
  - 親 token の作成ボタンを押した後の画面で、Copy ボタンを押すこと
  - 自分の端末で、親 token を読み込む zsh（「準備」の手順 2 と、段階 A と段階 B の zsh）を実行すること
- 作業者は、それ以外の Dashboard の画面を操作します。対象は、親 token の権限の選択、token の一覧、期限の確認、token の削除です。作業者は Claude in Chrome で操作してもかまいません。
- 作業者は、token の値が表示される画面に遷移しません。作業者は、その画面のスクリーンショットを撮りません。
- 子 token は Dashboard で作りません。子 token は、ユーザーの端末の zsh が API で作ります。子 token の値は、Dashboard にも作業者の画面にも表示されません。

| Secret prefix                   | bucket             | permission group                     | 使う operation                                    | 作る時期              | 期限         |
| ------------------------------- | ------------------ | ------------------------------------ | ------------------------------------------------- | --------------------- | ------------ |
| `IORI_TRANSFER_R2_WRITE`        | transfer bucket    | Workers R2 Storage Bucket Item Write | `prepare-target`、`migrate-data`                  | `prepare-target` の前 | `EXPIRES_ON` |
| `IORI_TRANSFER_R2_READ_ONLY`    | transfer bucket    | Workers R2 Storage Bucket Item Read  | `verify-import`、`cutover-route`、`deploy-worker` | `prepare-target` の後 | なし         |
| `IORI_APPLICATION_R2_WRITE`     | application bucket | Workers R2 Storage Bucket Item Write | `migrate-data`                                    | `prepare-target` の後 | `EXPIRES_ON` |
| `IORI_APPLICATION_R2_READ_ONLY` | application bucket | Workers R2 Storage Bucket Item Read  | `verify-import`、`cutover-route`                  | `prepare-target` の後 | `EXPIRES_ON` |

各 prefix には、末尾に `_ACCESS_KEY_ID` と `_SECRET_ACCESS_KEY` を付けた 2 つの secret があります。`deploy-worker` は移行後も毎回、`IORI_TRANSFER_R2_READ_ONLY` で準備記録を読みます。このため、`IORI_TRANSFER_R2_READ_ONLY` には期限を付けません。Bucket Item Read は bucket 全体の読み取りと一覧を許すので、この credential は transfer bucket の移行 bundle も読めます。移行 bundle をいつ、どう削除するかは、バックログ B11 で決めます。

`EXPIRES_ON` は、`cutover-route` の完了予定日に 14 日を足した日時にします。14 日は、`migrate-data` の遅延や再実行に備えた余裕です。

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
   - zsh は、親 token が有効かを `GET /accounts/<ACCOUNT_ID>/tokens/verify` で確かめます。Copy に失敗していると、クリップボードには古い内容が残っています。このため、zsh は有効でない場合に止まります。
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
   EXPIRES_ON='<cutover-route の完了予定日 + 14 日（RFC 3339）>'
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

   if ! cf_api GET /tokens/verify | jq -e '.success and .result.status == "active"' >/dev/null; then
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

   `issue_r2` は、失敗したときに `errors` だけを表示します。成功したときは何も表示しません。`issue_r2` は、呼ばれるたびに直前の credential を消してから作業します。このため、`issue_r2` が失敗した後の `s3` は、前の token で疎通を確かめずに失敗します。

**段階 A: `prepare-target` の前**

1. ユーザーが、手順 2 の zsh を読み込んだ端末で `IORI_TRANSFER_R2_WRITE` を作ります。

   ```zsh
   issue_r2 IORI_TRANSFER_R2_WRITE "$TRANSFER_BUCKET" "$ITEM_WRITE" "${PREFIX}-transfer-write" "$EXPIRES_ON"
   unset LAST_KEY_ID LAST_SECRET CF_ISSUER_TOKEN
   ```

2. 作業者が Dashboard の token 一覧で親 token を削除し、一覧から消えたことを確認します。
3. `prepare-target` が準備記録を transfer bucket に書き込んで読み戻すと、`IORI_TRANSFER_R2_WRITE` の疎通が確かめられます。

**段階 B: `prepare-target` の後、`migrate-data` の前**

1. 作業者とユーザーが「準備」の手順 1 で新しい親 token を作ります。ユーザーが手順 2 の zsh を読み込み直し、残りの 3 つを作ります。各 token を作った直後に、作った値で S3 の疎通を確かめます。読み取り専用の token では、書き込みが 403 で拒否されることも確かめます。

   ```zsh
   issue_r2 IORI_TRANSFER_R2_READ_ONLY "$TRANSFER_BUCKET" "$ITEM_READ" "${PREFIX}-transfer-read-only" '' &&
     s3 GET "${TRANSFER_BUCKET}/prepared-target/v1/${ENV_NAME}/${GENERATION}/record.json" &&  # 200
     s3 PUT "${TRANSFER_BUCKET}/connectivity-check/${GENERATION}"                              # 403

   issue_r2 IORI_APPLICATION_R2_WRITE "$UPLOADS_BUCKET" "$ITEM_WRITE" "${PREFIX}-application-write" "$EXPIRES_ON" &&
     s3 PUT "${UPLOADS_BUCKET}/connectivity-check/${GENERATION}" &&     # 200
     s3 DELETE "${UPLOADS_BUCKET}/connectivity-check/${GENERATION}"     # 204

   issue_r2 IORI_APPLICATION_R2_READ_ONLY "$UPLOADS_BUCKET" "$ITEM_READ" "${PREFIX}-application-read-only" "$EXPIRES_ON" &&
     s3 GET "${UPLOADS_BUCKET}?list-type=2&prefix=og/" &&               # 200
     s3 PUT "${UPLOADS_BUCKET}/connectivity-check/${GENERATION}"        # 403

   unset LAST_KEY_ID LAST_SECRET CF_ISSUER_TOKEN
   ```

2. 作業者が `gh api repos/iwasa-kosui/monorepo/environments/<environment>/secrets` で、8 つの secret 名と更新日時を確認します。値は読みません。
3. 作業者が Dashboard の token 一覧で親 token を削除し、一覧から消えたことを確認します。

**完了条件:** 段階 B の `s3` がすべて期待した status を返し、8 つの secret が登録されていることです。この条件を満たすまで `migrate-data` を実行しません。

- 読み取り専用の token への PUT が 403 以外を返した場合は、作業者がその子 token を Dashboard の token 一覧ですぐに削除し、レビューに戻します。
- `connectivity-check/` の DELETE が失敗した場合は、残った object を移行後の後始末で削除します。`verify-import` が列挙するのは `post-images/` と `og/` だけなので、残った object は後続の検査に影響しません。
- `migrate-data` を始める前に、作業者が Dashboard の token 一覧で、期限のある 3 つの子 token の期限を確かめます。期限まで 3 日を切っている子 token がある場合は、Dashboard で期限を延ばしません。延ばした後に token の値が変わらないことを確かめていないからです。代わりに、作業者が Dashboard でその子 token を削除し、ユーザーが新しい親 token で `issue_r2` を実行して作り直します。作り直した後は、段階 B と同じ `s3` で疎通を確かめます。`transfer-write` を作り直した場合は、`s3 GET` で準備記録を読めることを確かめます。

**移行後の後始末**

- `cutover-route` の完了を確認した後に、作業者が Dashboard の token 一覧で `transfer-write`、`application-write`、`application-read-only` の子 token を削除します。期限は削除を忘れた場合の備えです。
- `transfer-read-only` の子 token は、その generation が active な間は削除しません。
- 作業者が Dashboard の R2 の object 一覧で、application bucket と transfer bucket の `connectivity-check/` に object が残っていないかを確かめます。object が残っていれば、作業者が Dashboard で削除します。読み取り専用の token への PUT が 403 にならなかった場合に書き込まれた object も、同じ prefix にあります。作業者は、その object も同じ方法で削除します。
- 切り替え後に transfer bucket の移行 bundle（準備記録以外）をいつ、どう削除するかは、バックログ B11 で決めます。

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

既存の `MICROBLOG_*`、`IORI_VAPID_*`、汎用 `CLOUDFLARE_API_TOKEN` は、新しい名前への自動マッピングではありません。VAPID については、下の「[VAPID 値の確認](#vapid-値の確認)」にユーザーの回答と自動の検査を書いています。GitHub API から secret 値を取り出すこともできません。既存の安全な保管元から適合する値を用意します。特に staging の source SSH を本番へ向けないでください。

### VAPID 値の確認

- 2026-11-01 にユーザーが回答しました。production Environment の旧名 `IORI_VAPID_*` と、repo レベルの `VAPID_*` は同じ鍵です。workflow は repo レベルの `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を受け取ります。
- Worker の満たすべき条件は、現行の Node 版と同じ鍵を使うことです。Node 版は、source サーバーの `/etc/systemd/system/microblog.service.d/env.conf` から VAPID の値を読みます。
- `prepare-target` だけが Worker に VAPID の値を設定します。同じ generation では、リソースを作り始めた後の `prepare-target` を再実行できません。
- このため、`prepare-target` は Cloudflare のリソースを作る前に、次の検査を自動で行います（`scripts/vapid-origin-check.mjs`）。
  - `VAPID_PRIVATE_KEY` から導いた公開鍵が、`VAPID_PUBLIC_KEY` と一致すること。2 つの鍵は、パディングなしの base64url でなければなりません。Worker の Web Push の実装も、パディングなしの base64url しか受け付けません。
  - production だけで、`ORIGIN` の `/api/v1/push/vapid-public-key` が返す `publicKey` が、`VAPID_PUBLIC_KEY` と一致すること。staging には `prepare-target` の時点で応答するアプリがないので、staging ではこの照合を行いません。
- 検査の結果（`VAPID key pair match` と `Origin VAPID public key match` の `yes`、`no`、`skipped`）と、失敗時の文言は、runner の private ログにだけ記録されます。private ログは job の終わりに削除されるので、作業者は後から読めません。Actions の公開ログには、どの失敗でも「Protected workflow step failed; retain remote state for reviewed recovery.」とだけ出ます。公開ログで失敗の種類を見分けられるようにする対応は、バックログ B12 で行います。
- `prepare-target` が失敗した場合は、作業者が Dashboard で Worker `iori-<environment>-<generation>` と、その generation の D1、KV、Queue、R2 bucket の有無を確かめます。
  - どれも存在しない場合は、`prepare-target` がリソースを作る前に止まっています。VAPID の検査で止まった可能性があります。作業者は次の順に対応します。
    1. ユーザーが source サーバーの `env.conf` の `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を、production Environment の secret として標準入力で登録します。鍵は、末尾の `=` と改行を除いた base64url の値で登録します。パディングや改行が残っていると、同じ検査で再び失敗します。Environment secret は、同じ名前の repo レベル secret より優先されます。
    2. 作業者が同じ generation で `prepare-target` をやり直します。
    3. やり直しても失敗し、リソースも作られていない場合は、GitHub hosted runner から `ORIGIN` に到達できない可能性があります。この場合は作業を止めて、レビューに戻します。
  - どれか 1 つでも存在する場合は、リソースを作り始めた後に失敗しています。この場合は、[中断と引き継ぎ](#7-中断と引き継ぎ)の「準備の結果が不明」の行に従います。
- 旧名の `IORI_VAPID_*` と variable `IORI_VAPID_SUBJECT` は、切り替えが終わるまで削除しません。

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

本番 source の事前配備は、環境保護・固定 runtime・既存 DB/TLS 設定の保持・最新 main のレビューと明示承認が揃ってから `deploy-iori.yml` で行います。配備は env.conf の `UPLOAD_DIR` が dist の外にある既存のディレクトリを指していることを確認し、満たさなければ止まります。merge で同じ SHA の source job が起動済みなら、それを確認し、重複 dispatch しません。DB schema の push はこの事前配備に含みません。

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

| 順序 | Operation        | 次へ進む条件                                                                                                                                                        |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `prepare-target` | VAPID の検査（[VAPID 値の確認](#vapid-値の確認)）が成功、Fresh state、sealed Worker、route absent、Queue 配送停止、consumer と prepared record の実 readback が成功 |
| 2    | `migrate-data`   | source/profile/容量を事前検査後、凍結・drain、全 import・照合、署名 bundle と complete marker の保存が成功                                                          |
| 3    | `verify-import`  | 別の新しい runner で bundle を復元し、署名・D1/R2/OGP の実データを再検証して成功                                                                                    |
| 4    | `cutover-route`  | 同じ job 内の fresh restore、workers.dev smoke、route、canonical smoke、source 凍結の照合、HTTP 有効化、Queue の最後の再開と smoke が成功                           |

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

**既知の制限:** Worker の記事公開処理は OGP 画像を生成しません。移行時に存在する記事の OGP 画像は、データ移行の backfill が R2 に保存します。切替後に公開した記事の `/og/...` は 404 を返します。この手順はこの制限を既知の制限として残し、別の変更で対応します。

## 7. 中断と引き継ぎ

| 中断地点                      | 維持する状態                            | 次の対応                                                                                                                                                 |
| ----------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認証・保護・source 診断で停止 | 稼働中 source を維持                    | 未確認項目・拒否された操作・必要な担当者を記録                                                                                                           |
| 準備の結果が不明              | 部分生成した generation と state を保持 | 実 readback で状態を特定。generation を再利用して自動再実行しない（generation のリソースが1つも無い場合を除く。[VAPID 値の確認](#vapid-値の確認)を参照） |
| 凍結後、HTTP 有効化前         | Source の凍結、予約、部分 import を保持 | 移行先書き込みが未有効であることを確認し、明示承認した復旧だけを実施                                                                                     |
| HTTP 有効化後                 | 旧 source を凍結したまま保持            | 移行先での復旧を優先し、差分を照合するまで旧 source を再開しない                                                                                         |

具体的な復旧条件は [cutover runbook の Rollback](./cloudflare-cutover-runbook.md#4-rollback)に従います。`reconcile-resources` と `replace-queue-consumer` は現行 workflow が権限使用前に拒否する保守用の未提供操作です。復旧の代用として dispatch しません。

完了後も14日間の監視・保持を続け、AWS retirement は保持証跡と destroy plan のレビュー・明示承認後の別作業とします。実行者は「最後に成功した段階」「確認済みの現在状態」「次の操作」「必要な承認」を残し、次の担当者が同じ run の続行と新規移行を取り違えないようにします。
