# Cloudflare 移行の実行手順

作業者はこの手順で認証・Environment・source を準備し、旧環境への復旧と運用を [cutover runbook](./cloudflare-cutover-runbook.md)に従って進めます。public repository と GitHub-hosted `ubuntu-latest` を使います。以下のコマンドを一括実行せず、各段階の完了条件を確認して進めてください。ユーザーの判断により、今回の移行は staging を使わず production だけで行うため、この文書にある staging の手順は任意です。

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

`main` への push で起動する配備は、Worker 配備の `.github/workflows/deploy-iori-worker-main.yml`（`Deploy iori Worker (main)`）です。この workflow は、本番の Worker の中身か配備に影響するファイルを変える push で `deploy-worker` を実行します。対象は、`apps/iori/src`（テストを除く）、`public`、`drizzle-d1`、`workers/iori/wrangler.template.jsonc`、`infra/cloudflare` の Terraform 定義、`scripts`（テストと型定義を除く）、依存とビルドの設定ファイル、`packages/result`、この workflow 自身です。docs とテストだけを変える push では、この workflow は起動しません。正確な一覧は workflow の `on.push.paths` にあります。environment は `production` 固定なので、push で起動した job も production の承認待ちになります。source 配備の `deploy-iori.yml` は push では起動せず、手動の dispatch だけで実行します。

3つの workflow（`Deploy iori`、`Deploy iori Worker`、`Deploy iori Worker (main)`）は、concurrency group `deploy-iori-worker-production` を共有します。push で起動した `deploy-worker` が production の承認待ちの間は、その run がこの group を占有します。このため、dispatch の操作は、push で起動した run が終わるまで待たされます。dispatch の操作は、`Deploy iori` のロールバックと、`deploy-iori-worker.yml` の各 operation です。GitHub は group ごとに待ちの run を1件しか保ちません。後から来た push の run が、待っている dispatch の run を取り消すことがあります。承認者は、push で起動した run を承認するか却下するかを速やかに決めます。dispatch の操作を先に通したいときは、承認者が push で起動した run を却下します。作業者は、dispatch した後に、その run が取り消されずに残っているかを確かめます。main に新しい配備の run が始まると、workflow「Cancel superseded iori deploys」が、まだ deploy-worker の job を開始していない古い run を自動で取り消します。Actions の履歴には、この run が cancelled と表示されます。

push で起動した run を承認者が却下した場合や、その run が取り消された場合は、本番の Worker が main より古いまま残ります。`Deploy iori Worker (main)` は配備の対象のファイルを変える push でしか起動しないので、docs やテストだけの push では本番は main に追いつきません。GitHub は push の差分の先頭300ファイルだけで paths を判定するので、大きな push では対象のファイルを変えていても起動しないことがあります。これらの場合、作業者は dispatch の操作を終えた後に、`deploy-iori-worker.yml` を `operation=deploy-worker`、`environment=production`、`main_sha=<最新の main の SHA>` と移行時の `generation`、`migration_run_id`、`migration_main_sha` で dispatch し、本番を main に合わせます。

Environment と `main` の保護は、2026-10-31 の読み戻しで有効を確認しました。**source credential の供給と merge より前に、この保護が維持されていることを再確認してください。** Ready 化・merge は明示承認後に行い、承認者は、merge により起動した Worker 配備の job を、merge した変更を本番に出してよいと確かめてから承認します。

## 3. 移行先と Environment inputs の準備

### 3.1 用途別 credential

1. 稼働中の generation と移行時の run ID を、非公開の作業記録に固定します。generation は先頭が小文字英字の8〜20文字の小文字英数字、run ID は英数字・`_`・`-` の1〜80文字です。
2. [infra README](../../infra/cloudflare/README.md#environment-references)に従い、Cloudflare API token を用意します。`deploy-worker` と `put-worker-secrets` は、この token を `IORI_CLOUDFLARE_DEPLOY_API_TOKEN` として使います。

Cloudflare REST API token の実際の permission と readback API の適合も確認します。通常の広い token を全 role に流用して完了扱いにしません。

### 3.2 登録する参照名

値は GitHub の **Settings → Environments → 対象 Environment → Environment secrets** へ登録します。下表は全13名を網羅しています。

| 用途          | Secret 名                                                                                                    | 値の準備元                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 移行先        | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `ORIGIN`                                                      | 確認済み account・zone・canonical origin                                   |
| 実行 identity | `IORI_ADMISSION_IDENTITY`                                                                                    | 次項の同じ environment/generation/SHA/run と smoke の項目                  |
| API role      | `IORI_CLOUDFLARE_DEPLOY_API_TOKEN`                                                                           | 第3.1節の token                                                            |
| Source SSH    | `IORI_SOURCE_SSH_HOST`, `IORI_SOURCE_SSH_USER`, `IORI_SOURCE_SSH_PRIVATE_KEY`, `IORI_SOURCE_SSH_KNOWN_HOSTS` | 許可された source と信頼済み host key                                      |
| Smoke         | `SMOKE_QUEUE_TOKEN`                                                                                          | 16〜1,024文字のランダム ASCII。`put-worker-secrets` が入口で形を検査します |
| Web Push      | `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`                                                     | 既存購読と対応する承認済み VAPID 設定                                      |

operation が使う参照名は、次のとおりです。

- `deploy-worker`: `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_ZONE_ID`、`IORI_ADMISSION_IDENTITY`、`ORIGIN`、`VAPID_SUBJECT`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN`
- `put-worker-secrets`: `CLOUDFLARE_ACCOUNT_ID`、`IORI_ADMISSION_IDENTITY`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`SMOKE_QUEUE_TOKEN`。任意の secret として `BLUESKY_IDENTIFIER` と `BLUESKY_APP_PASSWORD` も受け取ります
- `put-bluesky-secrets`: `CLOUDFLARE_ACCOUNT_ID`、`IORI_ADMISSION_IDENTITY`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN`、`BLUESKY_IDENTIFIER`、`BLUESKY_APP_PASSWORD`。任意の secret として `BLUESKY_CREDENTIAL_KEY` も受け取ります
- `put-twitterapi-secret`: `CLOUDFLARE_ACCOUNT_ID`、`IORI_ADMISSION_IDENTITY`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN`、`TWITTERAPI_IO_API_KEY`
- `delete-rehearsal-d1`: `CLOUDFLARE_ACCOUNT_ID`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN`
- `move-unfollowed-reposts-dry-run`、`move-unfollowed-reposts`、`delete-unfollowed-posts-dry-run`、`delete-unfollowed-posts`、`prune-federated-posts-dry-run`、`ensure-event-archive-bucket`: `CLOUDFLARE_ACCOUNT_ID`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN`
- `delete-blocked-domain-posts-dry-run`、`delete-blocked-domain-posts`: `CLOUDFLARE_ACCOUNT_ID`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN`
- `resume-source`、`release-pending-freeze`、`restart-failed-source`、`diagnose-source`: Source SSH の4件だけ

既存の `MICROBLOG_*`、`IORI_VAPID_*`、汎用 `CLOUDFLARE_API_TOKEN` は、新しい名前への自動マッピングではありません。VAPID については、下の「[VAPID 値の確認](#vapid-値の確認)」にユーザーの回答と自動の検査を書いています。GitHub API から secret 値を取り出すこともできません。既存の安全な保管元から適合する値を用意します。staging を使う場合は、staging の source SSH を本番へ向けないでください。

### VAPID 値の確認

- 2026-11-01 にユーザーが回答しました。production Environment の旧名 `IORI_VAPID_*` と、repo レベルの `VAPID_*` は同じ鍵です。workflow は repo レベルの `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を受け取ります。
- Worker の満たすべき条件は、現行の Node 版と同じ鍵を使うことです。Node 版は、source サーバーの `/etc/systemd/system/microblog.service.d/env.conf` から VAPID の値を読みます。
- `put-worker-secrets` は、Worker に値を送る前に、次の検査を自動で行います（`scripts/vapid-origin-check.mjs` の `vapidKeyPairMatches`）。
  - `VAPID_PRIVATE_KEY` から導いた公開鍵が、`VAPID_PUBLIC_KEY` と一致すること。
  - 2つの鍵が、パディングなしの base64url であること。秘密鍵は 32 byte、公開鍵は `0x04` で始まる 65 byte でなければなりません。Worker の Web Push の実装も、パディングなしの base64url しか受け付けません。
- どちらかの検査に失敗すると、`put-worker-secrets` は `stage=put-worker-secrets`、`reason=vapid-rejected` の `IORI_DIAG` の行を出して止まります。この時点で Worker の secret は変わっていません。
- `put-worker-secrets` は、`ORIGIN` の `/api/v1/push/vapid-public-key` が返す公開鍵との照合を行いません。
- `reason=vapid-rejected` で止まった場合、ユーザーが source サーバーの `env.conf` の `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を、production Environment の secret として標準入力で登録します。鍵は、末尾の `=` と改行を除いた base64url の値で登録します。パディングや改行が残っていると、同じ検査で再び失敗します。Environment secret は、同じ名前の repo レベル secret より優先されます。登録した後に、作業者が `put-worker-secrets` をやり直します。
- 切り替えは終わっています。workflow は旧名の `IORI_VAPID_*` と variable `IORI_VAPID_SUBJECT` を読まないので、削除してかまいません。

CLI で1件ずつ登録する場合は、値を command argument にせず、承認済みの mode `0600` ファイルを標準入力に渡します。これは登録例であり、全値を自動生成するコマンドではありません。

```bash
gh secret set IORI_CLOUDFLARE_DEPLOY_API_TOKEN \
  --repo "$iori_repo" --env "$iori_environment" \
  < "$iori_ops_dir/deploy-api-token"
gh secret list --repo "$iori_repo" --env "$iori_environment"
```

### 3.3 Identity の照合

`IORI_ADMISSION_IDENTITY` は JSON 内容を登録します。値は実データ・実リソースから選び、次の対応を検査します。

| JSON field                                                  | 対応する値                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `environment`, `generation`, `runId`                        | workflow の `environment`, `generation`, `migration_run_id`             |
| `mainSha`                                                   | 移行に使うレビュー済み最新 main の40桁 SHA                              |
| `hostname`                                                  | `ORIGIN` の canonical hostname                                          |
| `workerHostname`                                            | 新 generation の確認済み workers.dev hostname                           |
| `smoke.username`, `smoke.uploadFilename`, `smoke.articleId` | schema が必須にしている項目。いまはどの operation も smoke を実行しない |

`smoke.*` の項目は `IORI_ADMISSION_IDENTITY` の schema が必須にしていますが、いまはどの operation も smoke を実行しません。どの operation も Worker の OGP 生成の経路を検証しません。作業者は、その経路を第5.2節の「production での OGP 確認」で確かめます。

fixture のゼロ UUID や仮の hostname を本番へ登録しません。identity は、稼働中の generation の途中で差し替えません。

**完了条件:** 参照名、対象、権限、鍵の対応、identity が揃う。各 role の実接続が検証できるまで credential 名だけで pass にしない。

## 4. Source の診断と事前配備

作業者は旧環境に直接入りません。作業者は、確認したい項目を管理役に伝えます。作業者は、CI（GitHub Actions）の operation `diagnose-source` で旧環境の状態を読みます。管理役の指示を受けた作業者が `diagnose-source` を dispatch し、production Environment の required reviewer が実行を承認します。`diagnose-source` の手順と出力項目は[第6.2節](#62-旧環境の状態を読み取る)に書いてあります。`diagnose-source` が成功すれば、hosted runner から旧環境へ SSH で接続できたことも分かります。ただし、この成功は source が移行可能であることを証明しません。

作業者は、読み取った値を非公開で記録します。未確認・不一致を見つけたら、修正内容を具体化して事前配備より前に解消します。下表の「操作・対象」列に `diagnose-source` の項目名を書いた行は、その項目で確認します。Checkout、Runtime、Package manager、Private control の4行は、`diagnose-source` の出力に対応する値がありません。この4項目を確認できる operation は現在ありません。作業者は、この4項目が未確認であることを管理役に伝えます。管理役は、operation を追加するか、確認を省くかを判断します。

| 確認            | 操作・対象                                                                                                  | 完了条件                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 稼働状態        | `diagnose-source` の `active` と `sub`（`systemctl show microblog` の `ActiveState` と `SubState`）         | `active`。停止を drain の証拠にしない                                            |
| Checkout        | `$HOME/monorepo` の revision と tracked 変更                                                                | 配備前の revision を記録。変更があれば保持方針を決める                           |
| Runtime         | `$HOME/.nvm/versions/node/v24.12.0/bin/node`                                                                | 実体・所有者・実行権限・安全な mode を確認し、version が `v24.12.0`              |
| Package manager | `$HOME/.local/share/pnpm/pnpm`                                                                              | 同じ metadata 検査を行い、version が `10.12.4`。symlink を別実体へ自動追従しない |
| 凍結            | `diagnose-source` の `freeze`（`$HOME/.iori-migration/freeze.json`）と `freeze_pending`（`freeze.pending`） | 両方の有無を確認。存在したら再配備・再起動せず、その run の復旧判断へ進む        |
| Private control | `.iori-migration` の mode、owner、`control.sock`、control CLI                                               | 同じ service user、所定の private 配置。初回未配備ならその事実を記録             |
| 容量            | `diagnose-source` の `disk_free_mb`（home があるファイルシステムの空き）                                    | 旧環境の運用と配備に足りる空きがある                                             |

本番 source の事前配備は、環境保護・固定 runtime・既存 DB/TLS 設定の保持・最新 main のレビューと明示承認が揃ってから `deploy-iori.yml` で行います。配備は env.conf の `UPLOAD_DIR` が dist の外にある既存のディレクトリを指していることを確認し、満たさなければ止まります。`deploy-iori.yml` は merge では起動しないので、作業者は次の dispatch で実行します。DB schema の push はこの事前配備に含みません。

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
- `reason=source-control-not-ready`（`stage=status`）の場合、再起動したアプリが、上限 120 秒のあいだ control socket で応答できる状態になりませんでした。配備は status 段階で、socket が無い場合、接続を拒否された場合、アプリが準備中と応答した場合の3つだけを 3 秒間隔で再試行します。作業者は、この `reason` を管理役に伝えます。microblog サービスが起動しているかどうかと、起動に失敗していないかは、`diagnose-source` の `active`、`sub`、`journal` で読みます（[第6.2節](#62-旧環境の状態を読み取る)）。
- `IORI_NOTICE stage=status-unit active=<状態> sub=<副状態> result=<結果> restarts=<回数>` の行は、status 段階が失敗したときに、配備が microblog サービスの状態を読み取り専用の `systemctl show` で1回だけ読んだ結果です。配備は、この読み取りが失敗しても元の失敗を変えず、行を出さないだけです。配備は、サービスの再起動も `reset-failed` も実行しません。`result=start-limit-hit` の場合、systemd が起動回数の上限に達したために自動の再起動を止めています。start-limit-hit の後は、最初の起動から 180 秒の窓が過ぎるまで、systemd は手動の restart と次の配備の restart も拒否します。作業者は窓が過ぎるのを待ってから、管理役に手動の `systemctl restart microblog` を依頼するか、配備をやり直します。
- microblog サービスの unit（`apps/iori/microblog.service`）は、`Restart=always` と `RestartSec=5s` で再起動します。unit は `[Unit]` に `StartLimitIntervalSec=180` と `StartLimitBurst=30` を置くので、起動の失敗が続くと、systemd は約 150 秒のあいだ自動で再起動を試みます。この時間は、配備の status 確認が待つ 120 秒より長い時間です。再試行が上限に達するのは、180 秒の窓の中で 30 回起動したときだけです。アプリが数十秒動いてから落ちる場合は、上限に達せず、再起動を続けます。凍結中にこの再起動が続いた場合は、diagnose-source の `restarts` と `exits` で気付けます。旧環境の systemd は 235 以降です。2026-11-01 の diagnose-source（run 41283001455 と 41287264546）が、systemd 235 以降のプロパティである NRestarts を読めたことから判断しました。`[Unit]` の StartLimitIntervalSec と StartLimitBurst は、systemd 230 以降で効きます。
- `reason=source-operation-failed`（`stage=status`）の場合、status の確認が、再試行の対象でない理由で失敗しました。`stage=status` の行では `exit` と `signal` が常に `none` になるので、作業者はこの行から ssh の接続失敗と control socket の異常を区別できません。原因の候補は、ssh の接続失敗、control socket の mode や所有者の不正、応答の形式の不正です。作業者は、この `reason` を管理役に伝えます。`freeze` と `freeze_pending` の有無は、`diagnose-source` で読みます。`~/.iori-migration` の mode、所有者と control socket の状態は `diagnose-source` の出力に対応する値がないので、管理役に確認を依頼します。
- `reason=source-not-idle`（`stage=status`）の場合、アプリが control コマンドの実行中のために status を拒否しました。作業者は、実行中の operation（export など）が終わるのを待ってから再実行します。
- `reason=unclassified` の場合、失敗は既知の分類に当たりません。作業者は分類表（`apps/iori/scripts/deploy-source.mjs`）への追加を検討します。

### 4.2 旧版へ戻す

Deploy iori（`deploy-iori.yml`）は、配備する SHA が最新の main であることを要求します。作業者は旧版へ戻すとき、旧環境に直接入って操作しません。手順は次のとおりです。

1. 作業者は、戻したい変更を main で revert する PR を作り、レビューを経て merge します。
2. 作業者は、merge の後に `gh workflow run deploy-iori.yml --repo "$iori_repo" --ref main` で Deploy iori を dispatch します。production environment の承認者が実行を承認します。Deploy iori は push では起動しません。この merge の push では Worker 配備の `Deploy iori Worker (main)` が起動し、production の承認待ちになります。
3. 作業者は、step「Deploy guarded exact source revision」が成功したことと、`IORI_DIAG` 行が出ていないことを確認します。
4. 作業者は、本番の応答を確認します。

配備が `status` 段階より前で失敗した場合、旧環境の dist、unit、nginx.conf は途中まで更新されている可能性があります。配備は退避を作りません。作業者は、revert した main で Deploy iori をもう一度 dispatch し、旧版の内容で上書きします。

凍結（`~/.iori-migration/freeze.json` または `freeze.pending`）が残っている場合、配備はすべての段階で `reason=source-deploy-blocked` で止まります。作業者は、凍結の復旧を先に行います。`freeze.json` が残っている場合、作業者は `resume-source` を使います。手順は [6.1 節の `freeze.json` が残った場合](#freezejson-が残った場合)に書いてあります。`freeze.pending` が残っている場合、作業者は `release-pending-freeze` を使います。手順は [6.1 節の `freeze.pending` が残った場合](#freezepending-が残った場合)に書いてあります。

### 4.3 control socket が残った場合

アプリは起動時に `~/.iori-migration/control.sock` が残っていると、その socket に応答するプロセスがいないことを確かめてから削除します。確かめる条件は次の3つです。

- socket であること
- アプリと同じ uid の所有で、mode が 0600 であること
- 接続が拒否されること

条件を1つでも満たさない場合、アプリは `control_socket_exists` で起動に失敗します。

アプリは停止時に 60 秒の期限を持ちます。期限を過ぎると、アプリは自分が作った socket だけを削除して終了します。

アプリは起動のたびに、上の3つの条件を満たす残った socket を自動で削除します。microblog の unit は `Restart=always` を設定しているので、systemd が再起動するたびに、アプリはこの削除を行います。

それでも `control_socket_exists` で起動できない状態が続く場合、作業者は socket を手で削除しません。作業者は旧環境に直接入らず、管理役に判断を仰ぎます。

## 5. Hosted workflow の実行

### 5.1 実行を固定する

この節は第1〜4節の該当する前提が揃い、PR のレビューと明示承認後の merge が完了してから使います。

```bash
iori_main_sha="$(gh api "repos/$iori_repo/commits/main" --jq .sha)"
iori_environment=production
iori_generation='<稼働中のgeneration>'
iori_migration_run_id='<移行時のrunID>'
```

この例は `production` で実行します。staging を使う場合だけ、`iori_environment` を `staging` に変更します。`iori_main_sha` をレビュー対象および Environment の identity と照合します。main が進んだら実行を止めて再レビューし、古い identity を黙って書き換えません。PR head をそのまま main SHA として使いません。

### 5.2 一段階ずつ dispatch する

次のコマンドで `deploy-worker` を dispatch します。`iori_operation` だけを変更すると、同じコマンドで `put-worker-secrets` も dispatch できます。

```bash
iori_operation=deploy-worker
gh workflow run deploy-iori-worker.yml --repo "$iori_repo" --ref main \
  -f main_sha="$iori_main_sha" \
  -f migration_main_sha='<移行時の main SHA>' \
  -f operation="$iori_operation" \
  -f environment="$iori_environment" \
  -f generation="$iori_generation" \
  -f migration_run_id="$iori_migration_run_id"
```

旧環境（source）に書き込む operation が2つあります。

- `resume-source`: 凍結が残った source の凍結を解きます。
- `release-pending-freeze`: 凍結の前段階で残った `freeze.pending` を退避します。

この2つは、凍結が残ったときの復旧だけに使います。environment には dispatch の input の environment を使います。production では Environment の承認が必要です。手順は第6.1節に書きます。この2つの dispatch は `migration_main_sha` を必要とし、`resume-source` は `recovery` も必要とするため、上の例は使わず、第6.1節の例に従います。旧環境の状態を読み取るだけの `diagnose-source` は、旧環境に書き込まないため、この2つには含みません。手順は第6.2節に書きます。

Actions が返した run を開き、対象 operation、environment、generation、run ID、event SHA を確認して Environment の pending deployment を承認します。承認を回避するために Environment 設定を緩めません。run の識別には dispatch 直後の一覧も使えますが、「最新の1件」だけで断定せず日時と入力を照合します。

```bash
gh run list --repo "$iori_repo" --workflow deploy-iori-worker.yml \
  --branch main --event workflow_dispatch --limit 10 \
  --json databaseId,headSha,status,conclusion,createdAt
iori_actions_run_id='<照合済みのActions run番号>'
gh run view "$iori_actions_run_id" --repo "$iori_repo" \
  --json status,conclusion,jobs
```

HTTP body や raw log を取得・公開せず、各 job の sanitized status を確認します。dispatch が成功しただけでは operation の成功ではありません。失敗・timeout・結果不明なら、新しい操作や再実行を始める前に第6節へ進みます。

`deploy-worker` は active generation の通常更新用です。`deploy-worker` は、`wrangler deploy` の前に、D1 のマイグレーションを本番の D1 に適用します。手動用の `d1:migrate:remote` は、基準の記録の判定を通らず、本番の D1 で 0000 を再実行して失敗するので、本番では使いません。`deploy-worker` は `main` への push でも `Deploy iori Worker (main)` として起動します。この起動では、generation、`migration_run_id`、`migration_main_sha` を入力で受け取らず、Environment secret の `IORI_ADMISSION_IDENTITY` から Node の処理が取り出します。取り出した値は公開ログに出しません。この workflow に `workflow_dispatch` はありません。手動で Worker を配備するときは、従来どおり `deploy-iori-worker.yml` の `deploy-worker` を dispatch します。dispatch 版と同じく、`deploy-worker` は smoke を実行しません。push 版では、この workflow が generation、`migration_run_id`、`migration_main_sha` を同じ secret `IORI_ADMISSION_IDENTITY` から取り出します。このため、admission の照合は自己比較になり、dispatch 版にある「操作者の入力と secret の突き合わせ」は働きません。`deploy-worker` は、Terraform の state と準備記録を読みません。`deploy-worker` は、D1、KV、Queue、DLQ、Queue の consumer の id を、`wrangler deploy` の前に Cloudflare API で名前から引きます。名前は generation から決まります。一致が0件か2件以上の場合、`deploy-worker` は `wrangler deploy` の前に止まります。安全性は、identity の中身の検査と、名前から引いた id による active な Worker とリソースの読み戻しの照合に頼ります。

**OGP 画像の生成:** 移行時に存在した記事の OGP 画像は、データ移行の backfill が Node で生成して R2 に保存しました。切替後に公開した記事の OGP 画像は、Worker が `/api/og/articles/<article-id>` への要求で生成します。Worker はこの要求で R2 の `og/<article-id>.png` を探し、あれば返します。無ければ、公開済みの記事に限り Worker が PNG を生成し、R2 の `og/<article-id>.png` に保存して返します。記事の公開時には生成しません。次の点に注意してください。

- 最初の要求では、Worker が生成を終えるまで応答が遅くなります。2 回目以降は、Worker が R2 の PNG をそのまま返します。
- 記事が無い場合と記事が未公開の場合、Worker は生成せず 404 を返します。
- R2 の読み取り、D1 の記事参照、フォント取得、描画のいずれかに失敗すると、Worker は 503 を返し、`Retry-After: 60` と `Cache-Control: public, max-age=60` を付けます。Worker は R2 に保存せず、失敗を Worker のログに記録します。
- Worker は、失敗した記事への要求に対して、失敗から 60 秒間は生成を試みず 503 を返します。この記録は Worker の isolate ごとのメモリにあり、isolate が変わると消えます。60 秒を過ぎた要求で、Worker が再び生成を試みます。
- 生成時に、Worker は Google Fonts の `fonts.googleapis.com` と `fonts.gstatic.com` から、タイトルの描画に必要な文字だけのフォントを取得します。Worker の外向きの通信先が増えます。
- 生成は Worker の CPU 時間を使います。`workers/iori/wrangler.template.jsonc` に `limits.cpu_ms` は無く、Worker は Workers Paid の既定値 30 秒の範囲で動く想定です。Workers Free の CPU 時間 10 ms には収まらない想定です。第1節のとおり、この移行は Workers Paid を前提とします。

**production での OGP 確認:** 次を確認します。

1. R2 に `og/<article-id>.png` が無い公開済みの記事を1件選びます。
2. その記事について `/api/og/articles/<article-id>` を1回要求します。ブラウザでこの URL を開き、PNG が表示されることも確かめます。
3. 応答が 200 で、`Content-Type` が `image/png` であることを確認します。
4. R2 に `og/<article-id>.png` が保存されたことを確認します。

記録には pass/fail だけを残します。

### 5.3 deploy-worker の失敗の行

`deploy-worker` が失敗すると、公開ログの `stage=hosted-operation` の行の前に、`IORI_DIAG stage=<段> program=none exit=none signal=none reason=<語>` の行が出ます。読み取りが `state-mismatch` で止まったときは、外れた条件を示す `resource-` で始まる行が最大8行出て、最後に分類の行が1行出ます。行には固定の語だけが入り、メッセージの本文や ID は入りません。`main` への push で起動する `Deploy iori Worker (main)` も同じ `deploy-worker` の処理を実行するので、失敗したときに同じ `deploy-worker-*` の行を出します。この起動では generation、`migration_run_id`、`migration_main_sha` を `IORI_ADMISSION_IDENTITY` から取り出し、行にも出しません。

| `stage`                 | operation と時点                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `deploy-worker-before`  | deploy-worker で、レビュー済みの Worker の version の deploy を始める前                                                   |
| `deploy-worker-resolve` | deploy-worker で、`wrangler deploy` の前に、D1、KV、Queue、DLQ、consumer の id を Cloudflare API で名前から引いている途中 |
| `deploy-worker-migrate` | deploy-worker で、`wrangler deploy` の前に、D1 の基準の記録とマイグレーションを適用している途中                           |
| `deploy-worker-deploy`  | deploy-worker で、レビュー済みの Worker の version を deploy している途中                                                 |
| `deploy-worker-after`   | deploy-worker で、レビュー済みの Worker の version を deploy した後。deploy の後の Worker とリソースの読み直しを含みます  |
| `unclassified`          | 上のどれにも当たらない段                                                                                                  |

分類の行の `reason` には固定の語が出ます。固定の語に当たらない失敗では `unclassified` が出ます。`deploy-worker-after` で止まった場合は、Worker の新しい version が既に deploy されています。作業者は、Worker の version を記録して、レビューに戻します。`deploy-worker-deploy` で止まった場合は、Worker の新しい version が既に deploy されている可能性があります。作業者は、Worker の現在の version を読み取って記録し、レビューに戻します。

`deploy-worker` は、D1 のマイグレーションと `wrangler deploy` の前に、対象の環境で動いている現行の Worker の binding を検査します。現行の Worker に期待する binding がないと、`deploy-worker` は `stage=deploy-worker-before reason=worker-binding-missing` を出して止まり、環境は変わりません。binding を初めて足す PR は、同じ PR で、その名前を `apps/iori/scripts/update-active-worker.mjs` の `BINDINGS_ADDED_BY_THIS_RELEASE` に足します。既存の binding を、まだ持たない環境や世代に初めて入れる配備でも、作業者は配備の前に、この一覧に名前を足す PR を merge します。この一覧に名前がある binding に限り、配備前の検査は binding がないことを許します。一覧に名前があっても、現行の Worker にある binding の内容が期待と違うときは、`deploy-worker` は `worker-binding-mismatch` で止まります。配備後の検査は、全 binding を必須にします。binding を入れるすべての環境と世代で配備が成功したら、作業者は別の PR で、この一覧を `[]` に戻します。名前が一覧に残ると、binding が欠けた Worker も配備前の検査を通り、欠落は配備で環境が変わった後の検査で初めて見つかります。

`deploy-worker-before` と `deploy-worker-after` の読み取りが `state-mismatch` で止まったときは、外れた条件ごとに次の語の行が最大8行出ます。

| `reason`                     | 意味                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `resource-input`             | 読み取りに渡したリソースの ID の形が不正か、Queue と DLQ の ID が同じです。            |
| `resource-d1`                | D1 の uuid か名前が一致しません。                                                      |
| `resource-kv`                | KV の ID か title が一致しません。                                                     |
| `resource-r2`                | uploads、event-archive、transfer のどれかの bucket の名前が一致しません。              |
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

`deploy-worker-resolve` で止まると、`wrangler deploy` は実行されていません。この段は、Cloudflare に何も書き込みません。この段の失敗では、`IORI_DIAG` の行が2行出ます。1行目の `reason` は、どのリソースの id を引いている途中かを示す語です。2行目の `reason` は、止まった原因を示す語です。

| 1行目の `reason`   | 引いている途中のリソース |
| ------------------ | ------------------------ |
| `resolve-d1`       | D1 database              |
| `resolve-kv`       | KV namespace             |
| `resolve-queue`    | Queue                    |
| `resolve-dlq`      | dead letter queue        |
| `resolve-consumer` | Queue の consumer        |

| 2行目の `reason`     | 意味と作業者の判断                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resource-missing`   | generation の名前と一致するリソースが0件です。作業者は、`IORI_ADMISSION_IDENTITY` の generation が active な generation か、Dashboard で確かめます |
| `resource-ambiguous` | 一致するリソースが2件以上です。作業者は、名前の重複を Dashboard で確かめ、レビューに戻します                                                       |
| `api-forbidden`      | Cloudflare API が 401 か 403 を返しました。作業者は、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN` の権限と有効期限を確かめます                               |
| `api-failed`         | 401 と 403 以外の API の失敗か、応答の形が想定と違います。一覧が20ページを超えた場合も、この語が出ます。作業者は、同じ commit で再実行してよいです |

出力の例は、次のとおりです。

```
IORI_DIAG stage=deploy-worker-resolve program=none exit=none signal=none reason=resolve-d1
IORI_DIAG stage=deploy-worker-resolve program=none exit=none signal=none reason=resource-missing
```

この行には、リソースの名前、id、応答の本文を出しません。

`reason` に `d1-baseline-mismatch` が出た場合、`deploy-worker-migrate` は D1 の読み取りと判定で止まっています。この語は、0000 の表が D1 に一部だけある場合か、読み取りの結果が想定と違う場合に出ます。この時点で、`deploy-worker-migrate` は D1 に書き込んでいません。

`deploy-worker-migrate` で止まった場合は、基準の記録かマイグレーションの一部が、本番の D1 に適用済みの可能性があります。Worker は deploy されていません。作業者は、`d1_migrations` の行と表の状態を読み取って記録し、レビューに戻します。

#### put-worker-secrets で Worker の secret を更新する

`put-worker-secrets` は、稼働中の Worker の secret の `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`SMOKE_QUEUE_TOKEN` と、任意の `BLUESKY_IDENTIFIER`、`BLUESKY_APP_PASSWORD` だけを更新する operation です。この operation は、Worker のコードも D1 も Terraform の状態も変えません。作業者は、これらの値を GitHub の secret で入れ替えた後に、この operation で Worker に反映します。

必須の secret は `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`SMOKE_QUEUE_TOKEN` の3つです。いずれかが未設定の場合、job は失敗します。`BLUESKY_IDENTIFIER` と `BLUESKY_APP_PASSWORD` は任意の secret です。job は、値が空でないものだけを put します。未設定でも job は失敗しません。この2つは、Bluesky への投稿と、Bluesky の home タイムラインの取り込みの両方に使います。投稿は `IORI_BLUESKY_CROSSPOST` が `enabled` のときだけ動き、取り込みは `IORI_BLUESKY_TIMELINE` が `enabled` のときだけ動きます。どちらも template の値は `enabled` です。production と staging は同じ template を使います。2つの機能は互いに独立していて、どちらの機能も、この2つの secret が空でないときだけ動きます。Bluesky の secret だけを入れるときは `put-bluesky-secrets` を使います。この operation は production だけを受け付けます。staging に入れると、staging の Worker が同じ Bluesky アカウントに送信するからです。`put-worker-secrets` は staging でも実行でき、リポジトリ単位の Bluesky の secret も staging の Worker に入れます。staging の Worker が同じ Bluesky アカウントに送信するので、作業者は staging で `put-worker-secrets` を実行しないでください。

job が受け取る secret は、次の8つです。`STAGING_ACCESS_TOKEN` と Terraform の鍵は受け取りません。

| job の環境変数            | 元の GitHub secret                 |
| ------------------------- | ---------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`   | `CLOUDFLARE_ACCOUNT_ID`            |
| `IORI_ADMISSION_IDENTITY` | `IORI_ADMISSION_IDENTITY`          |
| `CLOUDFLARE_API_TOKEN`    | `IORI_CLOUDFLARE_DEPLOY_API_TOKEN` |
| `VAPID_PUBLIC_KEY`        | `VAPID_PUBLIC_KEY`                 |
| `VAPID_PRIVATE_KEY`       | `VAPID_PRIVATE_KEY`                |
| `SMOKE_QUEUE_TOKEN`       | `SMOKE_QUEUE_TOKEN`                |
| `BLUESKY_IDENTIFIER`      | `BLUESKY_IDENTIFIER`               |
| `BLUESKY_APP_PASSWORD`    | `BLUESKY_APP_PASSWORD`             |

手順は次のとおりです。

1. 作業者は、GitHub の対象の environment で、更新したい secret（`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`SMOKE_QUEUE_TOKEN`）を新しい値に更新します。必須の3つのうち更新しない secret にも、Worker に入れたい現在の値が入っていることを確かめます。operation は必須の3つを必ず put するからです。`BLUESKY_IDENTIFIER` と `BLUESKY_APP_PASSWORD` は、値が空でないものだけを put します。VAPID の鍵を入れ替えると、ブラウザが登録済みの push の購読は使えなくなります。利用者は、購読し直す必要があります。
2. 作業者は、`deploy-iori-worker.yml` を `operation=put-worker-secrets`、`environment`、`main_sha=<最新の main の SHA>` と、`deploy-worker` と同じ `generation`、`migration_run_id`、`migration_main_sha` で dispatch します。
3. production の場合、承認者は job の承認待ちを承認します。
4. job は、`IORI_ADMISSION_IDENTITY` の `environment`、`generation`、`runId`、`mainSha` が dispatch の入力と一致することを確かめます。
5. job は、`SMOKE_QUEUE_TOKEN` の形式と、`VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` が対の鍵であることを確かめます。
6. job は、Cloudflare API で Worker `iori-<environment>-<generation>` の deployments を読み、Worker が存在することを確かめます。
7. job は、`wrangler secret bulk` を1回だけ実行します。job は、put する値を JSON にして標準入力だけで渡し、ファイルの引数は付けません。job は、wrangler が `<put した secret の数> secrets successfully uploaded` の行を出したことも、成功の条件にします。値は、コマンドの引数にも、ログにも、`IORI_DIAG` の行にも出ません。

`wrangler secret bulk` は、put する secret を1回の設定の更新で Worker に送ります。このため、put する secret のすべてに新しい値が反映されるか、どれも反映されないかのどちらかです。1回の `put-worker-secrets` で Worker の version は1つだけ増えます。作業者は、実行後に Worker の現在の version を記録します。失敗した場合は、どの secret も新しい値になっていません。作業者は、原因を直してから `put-worker-secrets` を dispatch し直します。

失敗した場合、job は `IORI_DIAG stage=<段> program=none exit=none signal=none reason=<語>` の行を1行出します。`stage` は次のとおりです。

| `stage`                   | 時点                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| `put-worker-secrets`      | 入力の検査（identity、値の有無、`SMOKE_QUEUE_TOKEN`、VAPID の鍵の対）の途中 |
| `put-worker-secrets-read` | Worker の存在を Cloudflare API で確かめている途中                           |
| `put-worker-secrets-put`  | `wrangler secret bulk` を実行している途中                                   |

`reason` には、次の語が出ます。

| `reason`                                        | 意味                                                                                                                                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity-mismatch`                             | `IORI_ADMISSION_IDENTITY` が dispatch の入力と一致しない、または JSON として読めません                                                                                                                                                              |
| `credentials-missing`                           | account ID、API token、3つの値のどれかが空です                                                                                                                                                                                                      |
| `config-invalid`                                | `CLOUDFLARE_ACCOUNT_ID` の形式が正しくありません                                                                                                                                                                                                    |
| `smoke-token-empty` など `smoke-token-<区分>`   | `SMOKE_QUEUE_TOKEN` の形式が正しくありません。`<区分>` は `empty`（空）、`space`（先頭に空白があるか、値の途中に空白や改行がある）、`charset`（空白を含まない ASCII の表示文字以外を含む）、`short`（16文字未満）、`long`（1024文字超）のどれかです |
| `vapid-rejected`                                | `VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` が対になっていません                                                                                                                                                                                      |
| `workers-http-404` など `workers-http-<status>` | Worker の deployments を読む API が、その status を返しました。404 は、Worker が存在しないことを示します                                                                                                                                            |
| `workers-request`、`workers-shape`              | API への要求が失敗したか、応答の形が想定と違います                                                                                                                                                                                                  |
| `command-failed`                                | `wrangler secret bulk` が失敗したか、成功を示す `3 secrets successfully uploaded` の行が出ませんでした                                                                                                                                              |
| `aborted`                                       | 時間切れか中断で止まりました                                                                                                                                                                                                                        |

#### put-bluesky-secrets で Bluesky の secret を入れる

`put-bluesky-secrets` は、稼働中の Worker に `BLUESKY_IDENTIFIER` と `BLUESKY_APP_PASSWORD` の2つを必ず入れ、任意の `BLUESKY_CREDENTIAL_KEY` を値があるときだけ入れる operation です。この operation は、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`SMOKE_QUEUE_TOKEN` を読みません。作業者は、Bluesky の secret を入れるときにこの operation を使い、`put-worker-secrets` を使いません。`put-worker-secrets` は VAPID の鍵も入れ直し、鍵が入れ替わると既存の push の購読に届かなくなって戻せないからです。

この operation は production だけを受け付けます。`environment` が `production` 以外の場合、job は最初の step で失敗します。

作業者は、`deploy-iori-worker.yml` を `operation=put-bluesky-secrets`、`environment=production`、`main_sha=<最新の main の SHA>` と、`deploy-worker` と同じ `generation`、`migration_run_id`、`migration_main_sha` で dispatch します。`IORI_ADMISSION_IDENTITY` が dispatch の入力と一致しない場合、job は Worker に何も入れる前に止まります。`BLUESKY_IDENTIFIER` と `BLUESKY_APP_PASSWORD` のどちらかが空の場合、job は `reason=credentials-missing` で失敗します。`BLUESKY_CREDENTIAL_KEY` が空か未設定の場合、job は失敗せず、この secret だけを送りません。Worker にすでにある `BLUESKY_CREDENTIAL_KEY` の値は、そのまま残ります。

`put-bluesky-secrets` は、`wrangler secret bulk` を使いません。job は、Cloudflare の `PATCH .../workers/scripts/{worker}/secrets-bulk` API を直接呼びます。job は、`BLUESKY_IDENTIFIER` と `BLUESKY_APP_PASSWORD` の2つと、値が空でない場合の `BLUESKY_CREDENTIAL_KEY` だけを1回のリクエストで送ります。Cloudflare の API リファレンスは、リクエストに含めない secret は変わらないと明記しています。このため、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`SMOKE_QUEUE_TOKEN` は、この operation で変わりません。Cloudflare の文書で確かめられた内容は、1回のリクエストで1つの version を作ることです。

書き込みの後、job は deployment の一覧を読み直します。job は、最新の deployment が100%で新しい version を指していることを確かめます。確かめられない場合、job は失敗します。job は、secret の値と API の応答本文をログに出しません。

失敗した場合、job は次の `reason` を出します。

- `secrets-bulk-forbidden`: API が 401 か 403 を返しました。Worker の secret は変わっていない見込みです。作業者は、配備用の token `IORI_CLOUDFLARE_DEPLOY_API_TOKEN` に Workers Scripts の書き込み権限があるかを確かめます。作業者は、権限を直してから `put-bluesky-secrets` を dispatch し直します。
- `secrets-bulk-failed`: API の呼び出しが失敗したか、成功の応答を確かめられませんでした。secret が反映されたかどうかは分かりません。作業者は、同じ値で `put-bluesky-secrets` を dispatch し直せます。
- `secrets-bulk-not-deployed`: 書き込みの後の読み直しで、新しい version が100%の deployment になっていませんでした。secret は新しい version にあり、まだ配信されていない可能性があります。作業者は、Cloudflare のダッシュボードか deployment の一覧で状態を確かめます。その結果をもとに、作業者は、新しい version を deploy するか、`put-bluesky-secrets` を dispatch し直すかを決めます。`IORI_BLUESKY_CROSSPOST` と `IORI_BLUESKY_TIMELINE` が `disabled` の場合、配信中の Worker の動作に影響しません。
- `workers-http-NNN`、`workers-request`、`workers-shape`、`aborted`（`stage` が `put-bluesky-secrets-put` のとき）: job は書き込みの後の確認で止まった場合があります。secret は新しい version にある可能性があります。作業者は、`secrets-bulk-not-deployed` と同じ手順で deployment の一覧を確かめます。

#### put-twitterapi-secret で twitterapi.io の API キーを入れる

`put-twitterapi-secret` は、稼働中の Worker に `TWITTERAPI_IO_API_KEY` の1つだけを入れる operation です。この operation は、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`SMOKE_QUEUE_TOKEN`、`BLUESKY_IDENTIFIER`、`BLUESKY_APP_PASSWORD` を読みません。作業者は、API キーだけを入れるときにこの operation を使い、`put-worker-secrets` を使いません。`put-worker-secrets` は VAPID の鍵も入れ直し、鍵が入れ替わると既存の push の購読に届かなくなって戻せないからです。

この operation は production だけを受け付けます。`environment` が `production` 以外の場合、job は最初の step で失敗します。

作業者は、`deploy-iori-worker.yml` を `operation=put-twitterapi-secret`、`environment=production`、`main_sha=<最新の main の SHA>` と、`deploy-worker` と同じ `generation`、`migration_run_id`、`migration_main_sha` で dispatch します。`IORI_ADMISSION_IDENTITY` が dispatch の入力と一致しない場合、job は Worker に何も入れる前に止まります。GitHub の secret `TWITTERAPI_IO_API_KEY` が未登録か空の場合、job は何も書き込まず、`reason=credentials-missing` で失敗します。この場合、Worker の secret は変わりません。

job が受け取る secret は、`CLOUDFLARE_ACCOUNT_ID`、`IORI_ADMISSION_IDENTITY`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN`（job 内では `CLOUDFLARE_API_TOKEN`）、`TWITTERAPI_IO_API_KEY` の4つです。

`put-twitterapi-secret` は、`put-bluesky-secrets` と同じ仕組みで書き込みます。job は、Cloudflare の `PATCH .../workers/scripts/{worker}/secrets-bulk` API を直接呼び、`TWITTERAPI_IO_API_KEY` だけを1回のリクエストで送ります。リクエストに含めない secret は変わらないので、VAPID の鍵、`SMOKE_QUEUE_TOKEN`、Bluesky の secret はこの operation で変わりません。書き込みの後、job は deployment の一覧を読み直し、最新の deployment が100%で新しい version を指していることを確かめます。確かめられない場合、job は失敗します。job は、secret の値と API の応答本文をログに出しません。

失敗した場合、job は `IORI_DIAG` の行に `stage=put-twitterapi`（入力の検査）、`put-twitterapi-read`（Worker の存在の確認）、`put-twitterapi-put`（書き込みと書き込み後の確認）のどれかを出します。`reason` の意味と対処は、`put-bluesky-secrets` の `secrets-bulk-forbidden`、`secrets-bulk-failed`、`secrets-bulk-not-deployed`、`workers-http-NNN`、`workers-request`、`workers-shape`、`aborted` と同じです。ただし、再実行する operation は `put-twitterapi-secret` です。

#### delete-rehearsal-d1 で予行演習の空の D1 を削除する

`delete-rehearsal-d1` は、予行演習で作った空の D1 データベース `iori-production-prdrehearse1` から `iori-production-prdrehearse5` までの5つだけを削除する operation です。この operation は、Worker のコードも、ほかの D1 も、Terraform の状態も変えません。対象の名前は workflow の入力から受け取らず、スクリプトの定数で固定しています。名前が完全に一致するデータベースだけを扱うため、`iori-production-prd20261102a` などの本番の D1 は対象になりません。

job が受け取る secret は、次の2つです。

| job の環境変数          | 元の GitHub secret                 |
| ----------------------- | ---------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | `CLOUDFLARE_ACCOUNT_ID`            |
| `CLOUDFLARE_API_TOKEN`  | `IORI_CLOUDFLARE_DEPLOY_API_TOKEN` |

手順は次のとおりです。

1. 作業者は、`deploy-iori-worker.yml` を `operation=delete-rehearsal-d1`、`environment=production`、`main_sha=<最新の main の SHA>` で dispatch します。`generation` と `migration_run_id` は空にします。`migration_main_sha` は、空にするか `main_sha` と同じ値にします。`environment` が `production` 以外の場合、job は API を呼ばずに止まります。
2. 承認者は、job の承認待ちを承認します。
3. job は、Cloudflare API で D1 の一覧を `per_page=100` で全ページ読みます。一覧に同じ名前が2件ある場合、job はその名前を削除しません。
4. job は、対象の5つについて `present` か `absent` かを、`IORI_NOTICE` の行で出します。一覧に無い対象は、削除済みとして飛ばします。
5. job は、一覧にある対象ごとに、D1 の詳細を読んで名前が対象と一致することを確かめます。次に job は、テーブルが1つも無いことを `sqlite_master` への問い合わせで確かめます。SQLite 内部のテーブル（`sqlite_` で始まる名前）と D1 内部のテーブル（`_cf_` で始まる名前）は、数えません。
6. job は、空だった対象だけを削除します。1つの対象の削除が失敗しても、job はほかの対象の処理を続けます。テーブルがある対象、名前が不一致の対象、同名が2件ある対象を、job は削除しません。
7. job は、一覧を読み直して、対象が一覧に残っていないかを確かめ、`deleted` か `remaining` かを `IORI_NOTICE` の行で出します。
8. すべての対象が一覧から消えていれば、job は成功します。1つでも削除されなかった対象があれば、job は失敗します。

公開ログに出る `IORI_NOTICE` の行は、`IORI_NOTICE rehearsal-d1 name=<対象の名前> state=<状態>` の形です。`state` には、`present`、`absent`、`empty`、`not-empty`、`ambiguous`、`check-failed`、`deleted`、`delete-failed`、`remaining` のどれかが入ります。データベースの ID と、API token は、ログに出ません。

失敗した場合、job は `IORI_DIAG stage=<段> program=none exit=none signal=none reason=<語>` の行を、失敗の種類ごとに出します。`stage` は次のとおりです。

| `stage`                   | 時点                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `rehearsal-delete`        | 入力の検査（`IORI_ENVIRONMENT`、account ID、API token）の途中 |
| `rehearsal-delete-list`   | D1 の一覧を読んでいる途中、または同名が2件ある場合            |
| `rehearsal-delete-check`  | 詳細の名前の確認と、空かどうかの検査の途中                    |
| `rehearsal-delete-remove` | D1 を削除している途中                                         |
| `rehearsal-delete-verify` | 削除後の一覧の読み直しの途中                                  |

`reason` には、次の語が出ます。

| `reason`                                     | 意味                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `config-invalid`                             | `IORI_ENVIRONMENT` が `production` ではないか、`CLOUDFLARE_ACCOUNT_ID` の形式が正しくありません |
| `credentials-missing`                        | account ID か API token が空です                                                                |
| `api-forbidden`                              | Cloudflare API が 401 か 403 を返しました。API token の権限を確かめます                         |
| `d1-http-<status>`、`d1-request`、`d1-shape` | API が `<status>` を返したか、要求が失敗したか、応答の形が想定と違います                        |
| `identity-mismatch`                          | D1 の詳細の名前が、対象の名前と一致しません                                                     |
| `resource-ambiguous`                         | 同じ名前の D1 が2件あります                                                                     |
| `rehearsal-d1-not-empty`                     | D1 にテーブルがあるか、問い合わせの結果の形が想定と違います                                     |
| `rehearsal-d1-remaining`                     | 削除した後も、D1 が一覧に残っています                                                           |
| `aborted`                                    | 時間切れか中断で止まりました                                                                    |

失敗した場合、削除できた D1 は戻りません。作業者は、`IORI_NOTICE` の行で残っている対象を確かめ、原因を直してから `delete-rehearsal-d1` を dispatch し直します。`absent` の対象は、再実行でも飛ばされます。

#### move-unfollowed-reposts でフォローしていない actor の repost を federated に移す

`move-unfollowed-reposts-dry-run` は、本番の D1 の `timeline_items` から、フォローしていない remote actor の repost（`createdAt` が `repost_created_before_ms` 以下で、まだ論理削除されていないもの）を数えます。この operation は、SELECT だけを実行し、`IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=<N> posts=<N> already_federated=<N> to_create=<N> missing_posts=<N>` の行を出します。`move-unfollowed-reposts` は、同じ条件の repost について、federated の項目（relay は `https://relay.fedibird.com/actor` で、`accepted` のもの）と `federatedTimelineItem.created` のイベントを足し、`timelineItem.deleted` のイベントを足してから、`deletedAt` を立てます。この operation は `IORI_NOTICE move-unfollowed-reposts mode=apply created=<N> deleted=<N>` の行を出します。

対象の範囲は、次のとおりです。

- `posts` に無い `postId` を持つ repost は、federated の項目を作らずに、論理削除だけします。dry-run の `missing_posts` は、この repost の件数です。
- ローカルの投稿への boost は、対象にしません。フォローしていない remote actor が、ローカルの投稿を boost した repost も、移さず、論理削除もしません。
- relay が `accepted` になる前に、relay の actor 自身の Announce から作られた repost も、対象になります。この repost は、federated に移す先として正しいものです。
- apply が出す `created` と `deleted` は、その回の実行で足した件数です。前の実行で足した分は、含みません。

作業者は、どちらの operation も `environment=production`、`main_sha=<最新の main の SHA>`、対象の D1 の `generation`、`repost_created_before_ms=<ミリ秒の epoch。未来の時刻は不可>` で dispatch します。`migration_run_id` は空にします。作業者は、先に dry-run を dispatch し、件数を確かめてから、同じ入力で `move-unfollowed-reposts` を dispatch します。途中で失敗した場合も、同じ入力で `move-unfollowed-reposts` を dispatch し直せます。2回目以降は、すでに足した項目とイベントを足しません。

`move-unfollowed-reposts` は、複数の文を1回の `/query` で送ります。REST API がこの複数の文を1つのトランザクションとして扱うかどうかは、公式ドキュメントに記載がありません。途中で失敗しても、同じ入力で `move-unfollowed-reposts` を再実行すれば、最終状態はそろいます。

dry-run が遅いとき、または apply が時間切れで失敗したときは、作業者が `repost_created_before_ms` を古い時刻から段階的に大きくして、複数回に分けて dispatch します。`deletedAt` の条件があるので、段階的に実行しても、同じ repost を二重に処理しません。

#### delete-unfollowed-posts でフォローしていない actor の投稿を home から消す

`delete-unfollowed-posts-dry-run` は、本番の D1 の `timeline_items` から、フォローしていない remote actor の投稿（`type` が `post` で、`createdAt` が `repost_created_before_ms` 以下で、まだ論理削除されていないもの）を数えます。「フォローしていない」とは、ローカルの actor が1人もフォローしていないことです。投稿の actor がローカルの actor である行は、対象にしません。この operation は、SELECT だけを実行し、`IORI_NOTICE delete-unfollowed-posts mode=dry-run targets=<N> federated=<N>` の行を出します。`targets` は、対象の行の数です。`federated` は、対象の行が指す投稿のうち、`federated_timeline_items` に項目がある投稿の件数です。複数の行が同じ投稿を指す場合、この operation はその投稿を1件と数えます。`delete-unfollowed-posts` は、同じ条件の行について、`timelineItem.deleted` のイベントを足してから、`deletedAt` を立てます。この operation は `IORI_NOTICE delete-unfollowed-posts mode=apply deleted=<N>` の行を出します。

`delete-unfollowed-posts` は、論理削除だけをします。`move-unfollowed-reposts` と違い、federated の項目は足さず、`federatedTimelineItem.created` のイベントも足しません。repost の行（`type` が `repost`）は、対象にしません。

home の行と federated の項目の両方を持つ投稿は、いま `IORI_PRUNE_FEDERATED_POSTS` の Cron の削除から守られています。`delete-unfollowed-posts` が home の行に `deletedAt` を立てると、この保護が外れます。ほかの除外理由に当たらなければ、Cron は保持期間の後にその投稿を物理削除します。dry-run の `federated` は、この投稿の件数です。

作業者は、フォローしていない actor の Create から home の行を作らない修正の配備の後に、この operation を実行します。配備の前に同じ Create が再配送されると、新しい home の行が作られます。この行は home に出ず、再実行で消せます。

この operation は、フォローを外した actor の過去の行も対象にします。作業者が後でその actor をフォローし直しても、この operation が消した過去の投稿は home に戻りません。

作業者は、どちらの operation も `environment=production`、`main_sha=<最新の main の SHA>`、対象の D1 の `generation`、`repost_created_before_ms=<ミリ秒の epoch。未来の時刻は不可>` で dispatch します。`migration_run_id` は空にします。作業者は、先に dry-run を dispatch し、件数を確かめてから、同じ入力で `delete-unfollowed-posts` を dispatch します。

同じ入力で `delete-unfollowed-posts` を再実行しても安全です。`deletedAt` の条件があるので、削除済みの行は対象になりません。`timelineItem.deleted` のイベントは、同じ行にすでにあれば足しません。途中で失敗し、イベントだけが入って `deletedAt` が未設定の行が残った場合も、再実行がその行に `deletedAt` を立て、イベントは重複しません。apply が出す `deleted` は、その回の実行で `deletedAt` を立てた件数です。

`delete-unfollowed-posts` は、2つの文を1回の `/query` で送ります。REST API がこの2つの文を1つのトランザクションとして扱うかどうかは、公式ドキュメントに記載がありません。dry-run が遅いとき、または apply が時間切れで失敗したときは、作業者が `repost_created_before_ms` を古い時刻から段階的に大きくして、複数回に分けて dispatch します。

#### prune-federated-posts-dry-run で federated の古い remote 投稿の削除対象を数える

`prune-federated-posts-dry-run` は、本番の D1 に SELECT だけを送り、Worker の Cron が消す投稿の件数を事前に数える operation です。apply の operation はありません。削除は Worker の Cron が担当します。

Cron の削除は、Worker の環境変数 `IORI_PRUNE_FEDERATED_POSTS` が `enabled` のときだけ動きます。初期値は `disabled` です。値は `workers/iori/wrangler.template.jsonc` の `vars` にあります。削除を有効にするには、作業者が template の値を `enabled` に変える PR を作り、merge して配備します。ダッシュボードで変えた値は、次の配備が template の値で上書きします。

作業者は、`IORI_PRUNE_FEDERATED_POSTS` を `enabled` にする前に、dry-run が出す `candidates` と `to_delete` を確かめます。Cron が1日に消せる投稿は、最大8,000件です。federated で受け取る投稿が1日に8,000件を超えると、消し残しが溜まります。除外理由に当たる古い投稿は、消えずに残ります。Cron は、実行のたびにそれらの投稿を読み直します。このため、除外される件数が多いと、D1 の rows read が増えます。作業者は、有効にした後に、Cloudflare のダッシュボードで D1 の rows read を確かめます。

Cron は3時間ごとに動き、1回で最大1,000件を消します。内訳は、50件ずつ最大20回です。消す投稿は、federated で最後に受け取った時刻から7日より前のリモート投稿で、次の除外理由のどれにも当たらないものです。Cron は `domain_events` に書き込みません。

作業者は、`environment=production`、`main_sha=<最新の main の SHA>`、対象の D1 の `generation` で dispatch します。`migration_run_id` と `repost_created_before_ms` は空にします。

この operation は、次の形式の行を出します。

```text
IORI_NOTICE prune-federated-posts mode=dry-run candidates=<n> local_likes=<n> local_emoji=<n> home=<n> local_repost=<n> reply=<n> notification=<n> article=<n> to_delete=<n> cutoff_ms=<ms>
```

各ラベルの意味は、次のとおりです。

| ラベル         | 意味                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `candidates`   | federated で最後に受け取った時刻が `cutoff_ms` より前のリモート投稿の件数。投稿の作成時刻は見ません |
| `local_likes`  | ローカルのユーザーがいいねした投稿の件数                                                            |
| `local_emoji`  | ローカルのユーザーが絵文字リアクションを付けた投稿の件数                                            |
| `home`         | ホームタイムラインに、論理削除されていない項目がある投稿の件数                                      |
| `local_repost` | ローカルのユーザーが repost した投稿の件数                                                          |
| `reply`        | ローカルの投稿がこの投稿に返信している投稿、またはこの投稿がローカルの投稿への返信である投稿の件数  |
| `notification` | 通知が指している投稿の件数                                                                          |
| `article`      | 記事のルートになっている投稿の件数                                                                  |
| `to_delete`    | どの除外理由にも当たらない投稿の件数。Cron が消す件数の見込みです                                   |
| `cutoff_ms`    | 実行時刻の7日前を示すミリ秒の epoch                                                                 |

`local_likes` から `article` までは、除外理由ごとの件数です。1件の投稿が複数の除外理由に当たる場合、operation はその投稿を当たる理由すべてで数えます。このため、除外理由の件数の合計は、`candidates` から `to_delete` を引いた値より大きくなることがあります。

#### IORI_BLUESKY_CROSSPOST と IORI_BLUESKY_TIMELINE を切り替える

`IORI_BLUESKY_CROSSPOST` は iori の投稿を Bluesky に送る機能を、`IORI_BLUESKY_TIMELINE` は Bluesky の home タイムラインを取り込む機能を切り替えます。どちらも Worker の環境変数で、template の値は `enabled` です。production と staging は同じ template を使います。値は `workers/iori/wrangler.template.jsonc` の `vars` にあります。2つの機能は独立しているので、作業者は片方だけを有効にできます。

作業者は、機能を動かす前に、`put-bluesky-secrets` で `BLUESKY_IDENTIFIER` と `BLUESKY_APP_PASSWORD` を Worker に入れます。どちらかの secret が空だと、環境変数を `enabled` にしても機能は動きません。

値を変えるには、作業者が template の対象の値を変える PR を作り、merge して配備します。ダッシュボードで変えた値は、次の配備が template の値で上書きします。

`IORI_BLUESKY_TIMELINE` を有効にすると、Worker は1分ごとの Cron で Bluesky の home タイムラインを取り込み、D1 の `bluesky_timeline_items` に保存します。3時間ごとの別のタスクが、30日より古い行を消します。取り込んだ投稿は、Web UI のホームタイムラインに表示されます。

取り込みのログインが失敗すると、Cron の取り込みは30分のあいだログインを試みません。

`IORI_BLUESKY_TIMELINE` を `enabled` にすると、Worker はタイムラインの取り込みに加えて、1分ごとに Bluesky の通知を取得します。通知のための専用の環境変数はありません。

Worker は、取得した Bluesky の通知を iori の通知に保存し、新しい通知ごとに所有者へ Web Push を送ります。ただし、Worker は最初の取り込みでは Web Push を送らず、15分より古い通知の Web Push も送りません。Worker は、1回の実行で Web Push を個別に最大5件送り、残りを1件にまとめて送ります。

Worker は、最初の取り込みで、過去30日以内の通知を最大500件保存します。通知画面の既読位置をまだ保存していない所有者では、最初の取り込みの後に未読数が一度に増えます。

staging に同じ Secret を設定すると、staging の Worker も同じアカウントの通知を取得します。staging の所有者が Web Push を購読していれば、staging からも Web Push が届きます。

#### ensure-event-archive-bucket でドメインイベント退避用の R2 バケットを作る

`ensure-event-archive-bucket` は、ドメインイベントの退避先になる非公開の R2 バケット `iori-<environment>-<generation>-event-archive` を、まだ無いときだけ作る operation です。Terraform の定義にこのバケットを足す変更は、すでにある generation にバケットを作りません。このため、その変更を配備すると、`deploy-worker` の読み戻しがバケットの不在で止まります。作業者は、この operation で先にバケットを作ります。

この operation は、バケットを作る以外のことをしません。バケットの削除も、公開設定も、カスタムドメインも、Worker のコードも、D1 も、Terraform の状態も変えません。作成の要求は、バケット名だけを送ります。`location` と `jurisdiction` は送りません。Terraform の `cloudflare_r2_bucket` も名前だけを指定するので、この operation は同じ指定に合わせています。

job が受け取る secret は、次の2つです。

| job の環境変数          | 元の GitHub secret                 |
| ----------------------- | ---------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | `CLOUDFLARE_ACCOUNT_ID`            |
| `CLOUDFLARE_API_TOKEN`  | `IORI_CLOUDFLARE_DEPLOY_API_TOKEN` |

作業者は、dispatch する前に、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN` に R2 の書き込み権限があることを確かめます。権限が無い token では、バケットの作成が 403 で失敗します。

手順は次のとおりです。

1. 作業者は、`deploy-iori-worker.yml` を `operation=ensure-event-archive-bucket`、`environment=<production か staging>`、`main_sha=<最新の main の SHA>`、対象の `generation` で dispatch します。`migration_run_id` と `repost_created_before_ms` は空にします。`migration_main_sha` は、空にするか `main_sha` と同じ値にします。
2. 承認者は、job の承認待ちを承認します。
3. `environment` が `staging` の場合、job は D1 の一覧から `iori-staging-<generation>` を探します。見つからなければ、job は何も作らずに `state=staging-not-running` を出して成功します。同じ名前が2件あれば、job は失敗します。`environment` が `production` の場合、job は同じ一覧から `iori-production-<generation>` を探します。見つからなければ、job は何も作らずに `reason=resource-missing` で失敗します。同じ名前が2件あっても、job は失敗します。D1 がちょうど1件あるときだけ、job は次へ進みます。
4. job は、Cloudflare API でバケットを読みます。バケットがあれば `state=exists` を出します。バケットが無ければ（404）、job はバケットを作って `state=created` を出します。作成の要求が 409 を返した場合、同じ名前のバケットがすでにあるので、job は `state=create-conflict` を出して続けます。
5. job は、もう一度バケットを読み、名前が期待どおりであることを確かめます。一致すれば `state=verified` を出して成功します。

同じ入力で何度でも dispatch し直せます。バケットがあれば、job は書き込みを送りません。

公開ログに出る `IORI_NOTICE` の行は、`IORI_NOTICE event-archive-bucket environment=<production か staging> state=<状態>` の形です。`state` には、`exists`、`created`、`create-conflict`、`verified`、`staging-not-running`、`event-archive-bucket-forbidden` のどれかが入ります。

`event-archive-bucket-forbidden` は、Cloudflare API が、バケットの読み取りか作成の要求に 401 か 403 を返したことを示します。この語が出たとき、作業者は、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN` の権限を確かめます。具体的には、token に R2 の書き込み権限があるか、token が有効かを見ます。権限を足した後に、同じ入力で dispatch し直します。

失敗した場合、job は `IORI_DIAG stage=<段> program=none exit=none signal=none reason=<語>` の行を出します。`stage` は次のとおりです。

| `stage`                  | 時点                                                    |
| ------------------------ | ------------------------------------------------------- |
| `archive-bucket`         | 入力の検査（environment、account ID、generation）の途中 |
| `archive-bucket-resolve` | D1 を一覧で探している途中                               |
| `archive-bucket-read`    | 最初にバケットを読んでいる途中                          |
| `archive-bucket-create`  | バケットを作っている途中                                |
| `archive-bucket-verify`  | 作成後にバケットを読み戻している途中                    |

`reason` には、次の語が出ます。

| `reason`                                     | 意味                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `config-invalid`                             | `IORI_ENVIRONMENT`、`CLOUDFLARE_ACCOUNT_ID`、`IORI_GENERATION` の形式が正しくありません       |
| `credentials-missing`                        | account ID か API token が空です                                                              |
| `api-forbidden`                              | Cloudflare API が 401 か 403 を返しました。API token の権限を確かめます                       |
| `r2-http-<status>`、`r2-request`、`r2-shape` | API が `<status>` を返したか、要求が失敗したか、応答の形が想定と違います                      |
| `resource-ambiguous`                         | 同じ名前の D1 が2件あります                                                                   |
| `resource-missing`                           | production の D1 が見つかりません。または、作成した後に読み戻しても、バケットが見つかりません |
| `identity-mismatch`                          | 読み戻したバケットの名前が、期待する名前と一致しません                                        |
| `aborted`                                    | 時間切れか中断で止まりました                                                                  |

この operation は、バケットを足す Terraform の変更を merge する前に実行します。作業者は、対象にするすべての generation で `state=verified` を確かめてから、その変更を merge します。順序は、この operation の PR を merge し、operation を dispatch し、その後で Terraform の変更を merge する流れです。

#### delete-blocked-domain-posts でブロックしたドメインの保存済みの投稿を消す

`delete-blocked-domain-posts-dry-run` は、本番の D1 から、ブロックしたドメイン `baraag.net`（とそのサブドメイン）の actor が書いた投稿を数えます。この operation は、SELECT だけを実行し、`IORI_NOTICE delete-blocked-domain-posts mode=dry-run domain=baraag.net posts=<N> remote_posts=<N> timeline_items=<N> federated_items=<N> reposts=<N> likes=<N> emoji_reacts=<N> notifications=<N> orphan_repost_notifications=<N> images=<N> articles_skipped=<N> actors=<N> follows_out=<N> follows_in=<N> mutes=<N>` の行を出します。`delete-blocked-domain-posts` は、同じ条件の投稿と、投稿に付く行を消します。この operation は `IORI_NOTICE delete-blocked-domain-posts mode=apply deleted_posts=<N> deleted_timeline_items=<N>` の行を出します。対象のドメインは、スクリプトの定数で固定しています。workflow の入力では指定しません。

対象の範囲は、次のとおりです。

- 対象の投稿は、`actors.uri` のホストが `baraag.net` か `*.baraag.net` の actor が書いた `posts` の行です。`notbaraag.net` と `baraag.net.example` は対象になりません。`local_actors` に行がある actor は対象にしません。
- `articles.rootPostId` から参照される投稿は、対象にしません。dry-run の `articles_skipped` は、この投稿の件数です。
- dry-run の `remote_posts` は、対象の投稿のうち `remote_posts` に行がある投稿の件数です。`posts` との差を見るために出します。
- actor（`actors`、`remote_actors`）と `follows` の行は、消しません。dry-run の `actors`、`follows_out`（ローカルの actor がフォローしている行）、`follows_in`（ローカルの actor がフォローされている行）、`mutes` は、残る行の件数を確かめるために出します。
- apply が出す `deleted_posts` と `deleted_timeline_items` は、その回の実行で足した `post.deleted` のイベントと論理削除の件数です。前の実行で消した分は、含みません。

apply は、受信した Delete の処理（`onDelete`）と各 D1 ストアにそろえて、次の順で文を実行します。

1. 対象の投稿を指す `timeline_items` に `timelineItem.deleted` のイベントを足し、`deletedAt` を立てます。
2. 対象の投稿に付く通知（like、emojiReact、reply、repost）を消します。通知の種類ごとの表を先に、`notifications` を後に消します。like、emojiReact、reply の通知には、削除のイベントを足します。repost の通知には、ドメインに削除のイベントが無いため、イベントを足しません。
3. `reposts`、`likes`（`local_likes` と `remote_likes` が先）、`emoji_reacts`、`federated_timeline_items` のうち、対象の投稿を指す行を、各削除のイベントを足してから消します。
4. `post_images`、`post_quotes`、`local_posts`、`remote_post_recipients`、`remote_posts`、`posts` の順に消します。`posts` を消す前に `post.deleted` のイベントを足します。`post_translations` と `link_previews` は、外部キーの cascade で消えます。

作業者は、どちらの operation も `environment=production`、`main_sha=<最新の main の SHA>`、対象の D1 の `generation` で dispatch します。`migration_run_id` と `repost_created_before_ms` は空にします。作業者は、先に dry-run を dispatch し、件数を確かめてから、同じ入力で `delete-blocked-domain-posts` を dispatch します。

`delete-blocked-domain-posts` は、複数の文を1回の `/query` で送ります。REST API がこの複数の文を1つのトランザクションとして扱うかどうかは、公式ドキュメントに記載がありません。どの文も、対象を毎回 actor から引き直し、足したイベントの有無を確かめます。このため、途中で失敗しても、同じ入力で `delete-blocked-domain-posts` を再実行すれば、最終状態はそろいます。ただし、`/query` が全文を1つのトランザクションで実行する場合は、時間切れのたびに全体が巻き戻ります。apply が同じ失敗を繰り返すとき、作業者は再実行を続けず、文を分けて送る変更を検討します。

## 6. 中断と引き継ぎ

| 中断地点                      | 維持する状態                            | 次の対応                                                             |
| ----------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| 認証・保護・source 診断で停止 | 稼働中 source を維持                    | 未確認項目・拒否された操作・必要な担当者を記録                       |
| 凍結後、HTTP 有効化前         | Source の凍結、予約、部分 import を保持 | 移行先書き込みが未有効であることを確認し、明示承認した復旧だけを実施 |
| HTTP 有効化後                 | 旧 source を凍結したまま保持            | 移行先での復旧を優先し、差分を照合するまで旧 source を再開しない     |

具体的な復旧条件は [cutover runbook の Rollback](./cloudflare-cutover-runbook.md#1-rollback)に従います。`reconcile-resources` と `replace-queue-consumer` は現行 workflow が権限使用前に拒否する保守用の未提供操作です。復旧の代用として dispatch しません。

完了後も14日間の監視・保持を続け、AWS retirement は保持証跡と destroy plan のレビュー・明示承認後の別作業とします。実行者は「最後に成功した段階」「確認済みの現在状態」「次の操作」「必要な承認」を残し、次の担当者が同じ run の続行と新規移行を取り違えないようにします。

### 6.1 凍結が残った場合の復旧

凍結の前に失敗した場合、作業者は Deploy iori を同じ SHA で dispatch し直します。

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

### 6.2 旧環境の状態を読み取る

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
