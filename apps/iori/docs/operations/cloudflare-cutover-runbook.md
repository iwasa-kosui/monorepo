# Cloudflare cutover runbook

`iori` は Cloudflare Workers、D1、R2、KV、Queues で稼働しています。Lightsail/PostgreSQL からの移行は完了しています。この runbook は、旧環境へ戻す手順、14 日間の保持と AWS 撤去の承認、運用 signal、Terraform と Wrangler の分担を定めます。

作業を再開する場合は、[Cloudflare 移行の実行手順](./cloudflare-execution-guide.md)から始めてください。認証と Environment の設定、secret の準備元、source の診断、workflow dispatch と中断時の対応をまとめています。

## 移行後の構成

| 対象                          | 移行先                                   |
| ----------------------------- | ---------------------------------------- |
| HTTP、ActivityPub、Web Push   | Hono/Fedify を実行する Cloudflare Worker |
| アプリケーションデータ        | D1 と SQLite/Drizzle schema              |
| 投稿画像と OGP PNG            | R2                                       |
| クライアント静的ファイル      | Workers Assets                           |
| Fedify の再構築できる一時状態 | Workers KV                               |
| 非同期配送と失敗配送          | Queues と dead-letter queue              |

公開リポジトリ、workflow summary、Issue、PR、terminal log に残す証跡は、論理リソース名、件数、timestamp、pass/fail に限定します。account ID、database ID、namespace ID、Workers URL、secret、Terraform state、rendered Wrangler config、export/SQL/manifest の内容、HTTP response body は公開しません。

## 1. Rollback

旧環境が動いている間は、旧環境へ戻す手順を残します。Lightsail に凍結が残っていても、書き込みを自動で再開しません。再起動だけでは永続的な凍結は解除されません。復旧を明示的に承認した場合だけ、同じ SHA と run ID の source control に `resume` を指定します。指定する `recovery` の値は、次の段落と「route を作った後に旧環境へ戻す」の手順 4 が定めます。

HTTP を有効にした後は移行先の受付と配送を止め、移行先での復旧を優先します。D1/R2 に通常書き込みが発生した場合、その変更を照合・反映し終わるまで Lightsail の書き込みを再開しません。承認された復旧では `resume` に `destination_writes_reconciled` を指定します。これらの指定は operator の復旧判断であり、自動処理が推測して送信してはいけません。公開記録は件数と pass/fail に限定します。

### route を作った後に旧環境へ戻す

route を作った後に、公開先を旧環境へ戻す場合は、次の順に実施します。

1. Cloudflare の Workers Routes から `blog.kosui.me/*` の route を削除します。DNS は proxied のままにします。この削除は Cloudflare Dashboard で行う緊急の戻しです。第3節の「route rollback は production environment approval を必要とする」が指す操作とは別の操作です。
2. Worker が `active` に達していた場合は、その generation の配送 Queue の delivery を pause します。
3. Terraform の state は修正しません。workflow に `terraform apply` を呼ぶ経路はありません。`infra/cloudflare/main.tf` の route resource は `prevent_destroy = true` を指定しています。
4. `resume-source` で旧環境の凍結を解きます。入力 `recovery` には次の値を指定します。手順は[実行手順の第6.1節](./cloudflare-execution-guide.md#61-凍結が残った場合の復旧)に従います。
   - Worker が `active` に達する前は、`destination_writes_not_enabled` を指定します。
   - Worker が `active` に達した後は、移行先の書き込みの扱いを決めてから、`destination_writes_reconciled` を指定します。第1節の冒頭の2段落が、この指定の条件を定めています。
5. 次を確かめます。
   - 旧アプリが応答する。
   - `/users/kosui` の publicKeyPem が切り替え前と同じである。
   - 外部の Fediverse アカウントから連合が動く。
6. route が有効だった間に certbot の更新が失敗していないかを確かめます。

## 2. 14-day retention と AWS retirement

cutover 後 14 日間は Lightsail、PostgreSQL、upload backup、AWS state を保持します。

移行時に保存した bundle は、非公開 R2 に残っています。bundle を検証する operation と削除する operation は、現在ありません。bundle は cutover 完了から少なくとも 14 日間保持し、削除は承認後に行います。削除してよいのは bundle の object だけです。transfer bucket は、`deploy-worker` が readback で名前を検査するので残します。

この期間は毎日、次を記録します。

- `/readyz` を含む公開先の確認結果
- 現在の D1/R2 件数と object retrieval の結果、および正常な投稿・削除で説明できない変化
- Fediverse delivery と Web Push の成功/失敗 aggregate
- Queue retry/DLQ status と consumer failure aggregate
- Worker、D1、R2 の error aggregate

日次記録には日付、論理リソース名、aggregate count、pass/fail だけを残す。request/response body、object key、checksum 値、URL、ID、SQL、export/manifest、token を記録しない。

移行時の count/checksum の完全一致は、通常書き込みを有効にする前の受入れ条件です。cutover 後の投稿・画像追加・削除は live data を変更するため、日次確認で移行時の manifest との完全一致を要求しません。日次 backup や alert が設定済みとは扱わず、担当者と実際の設定を cutover 前に確認します。

14 日分の evidence が完了し、destroy plan が reviewed・明示承認された場合だけ、AWS retirement を承認する。承認前に Lightsail workflow、AWS state、backup、secret reference を削除・破棄してはいけない。この変更は retention evidence や destroy approval を記録するものではないため、旧 deploy path は保持する。保持する対象は、push のトリガーを外して手動の dispatch だけを残した `deploy-iori.yml` である。merge では旧環境へ配備されない。

承認後の cleanup は次の独立した reviewed change で実施する。

1. evidence の 14 日分と destroy plan の承認を確認し、public summary には pass/fail と日付だけを残す。
2. Lightsail が public traffic、write path、background delivery path のいずれにも入っていないことを `/readyz` の確認と aggregate metrics で確認する。
3. 旧環境向けの `.github/workflows/deploy-iori.yml`、Lightsail deploy scripts、AWS resource definitions、SSH/database/Node production secret references を削除する。local Node/PostgreSQL development が Worker deploy graph から到達不能なら残してよい。Worker の配備に使う `.github/workflows/deploy-iori-worker.yml` と `.github/workflows/deploy-iori-worker-main.yml` は削除しない。
4. backup は別途 retention approval がない限り削除しない。
5. `cloudflare:public-artifacts:check` と repository quality suite を実行し、旧 path を消した commit を reviewed する。

## 3. 運用 signal、alert、ownership

運用 owner は Cloudflare deploy on-call とする。alert は aggregate count と論理リソース名だけで通知し、on-call は Cloudflare dashboard/secure runner で詳細を確認する。Issue、PR、workflow summary に詳細 payload を転記しない。

| Signal                                 | Alert / daily review                               | Initial response                                                                                   |
| -------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Worker request/error rate と `/readyz` | readiness failure または error-rate threshold 超過 | Worker runtime と binding readiness を確認し、必要なら maintenance/rollback runbook に従う         |
| Queue retry/DLQ                        | retry 増加、DLQ 到達、consumer failure             | Queue consumer と delivery failure aggregate を確認し、DLQ replay は reviewed procedure だけで行う |
| D1                                     | query/error-rate threshold 超過                    | D1 availability と migration status を確認する。SQL や row payload は summary に出さない           |
| R2                                     | get/put/object retrieval failure                   | logical bucket と failure aggregate を確認する。object key や checksum は出さない                  |
| ActivityPub delivery                   | failed delivery aggregate 増加                     | Queue/DLQ と federation delivery aggregate を確認する                                              |
| Web Push                               | failed send aggregate 増加                         | Worker secret availability と provider response category を secure runner で確認する               |
| Daily data count                       | 正常な更新で説明できない件数の変化                 | 現在の利用状況と secure な運用記録を照合し、公開記録には count/pass-fail のみ残す                  |

アラート設定の変更、threshold、DLQ replay、route rollback は production environment approval を必要とする。手順を実施した on-call は timestamp、logical resource、aggregate count、pass/fail、次の owner だけを redacted summary に記録する。

## 4. Terraform/Wrangler ownership と最終受入れ

Terraform の管理対象は D1、R2、KV、Queue、DLQ、Queue consumer、route に限定します。Worker version/deployment/binding/secret は state に含めず、Wrangler が Worker version と producer binding を管理します。Wrangler config に Queue consumer 定義を置きません。Terraform は CI の validate（`terraform fmt`、`terraform init -backend=false`、`terraform validate`）だけで使い、保護 workflow は Terraform を実行しません。state/plan/config の生データは公開しません。

以下の CLI は Node 24.12.0 で `apps/iori` から実行します。workflow が各 job の private input と権限を用意し、任意の module や remote command は受け付けません。

| CLI                                | 役割                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `scripts/deploy-active-worker.mjs` | 現在 active の同じ generation へ reviewed code を一度 deploy し、version・route・Queue 設定を更新前後で照合する |
| `scripts/deploy-source.mjs`        | 凍結前の source control 事前配備を、固定 SSH/rsync と成果物検証・build SHA 照合で実行する                       |

`IORI_ENVIRONMENT`、`IORI_GENERATION`、`MAIN_SHA`、`IORI_MIGRATION_RUN_ID` と admission identity を同じ実行へ固定します。generation は先頭が小文字英字、残りが小文字英数字の 8〜20 文字です。run ID は英数字・underscore・hyphen の 1〜80 文字です。旧リソースの adoption、state move、destroy はこの経路に含めません。

各 job の最初の step で記録する `IORI_JOB_STARTED_AT` を期限の起点とし、checkout・setup・build も 5 時間 45 分の予算に含めます。期限や OS signal による中断は内部の command に伝え、その終了と cleanup を待ちます。

Wrangler と SSH の raw output は private file に捕捉します。公開出力の guard と実コマンドの終了 status を別々に確認し、失敗を成功へ変換しません。

各 job に渡す権限は役割ごとに分けます。API token は用途を限定し、存在する Environment 名だけを保護設定の完了とみなしません。

| 役割             | 必要な権限・入力                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 通常 Worker 更新 | Cloudflare API による D1/KV/Queue/DLQ/consumer の id の名前引き、現在の generation の route/Queue の読み取り、Worker と既存 Queue producer の deploy。移行時の identity と現在の code SHA を別々に指定 |
| source 事前配備  | 固定 SSH/rsync、信頼済み host key、reviewed SHA の成果物。既存 source-side DB/TLS 設定を利用                                                                                                           |

現行 tracked tree は public artifact gate で安全化する。過去の公開 history に残る旧 production identifier は credential として扱わないが、必要に応じて credential rotation と approved history purge を別途 reviewed change で実施する。この移行変更では destructive history rewrite を実行しない。

`IORI_ADMISSION_IDENTITY` の schema は smoke の項目を必須にしていますが、smoke を実行する operation は現在ありません。`deploy-worker` も smoke を実行しません。作業者は、公開先の確認を `/readyz` などの手動の確認で行います。fixture のユーザー名やゼロ UUID は `IORI_ADMISSION_IDENTITY` に登録しません。

切替前の workers.dev と切替後の custom domain は、別々の確認済み hostname として管理します。作業者は、`IORI_ADMISSION_IDENTITY` の `workerHostname` と `hostname` に、それぞれの hostname を登録します。

切替後の `deploy-worker` は、現在 `active` の同じ generation への通常更新に限定します。`MAIN_SHA` は今回の checkout/build を制御する reviewed current-main SHA、`IORI_MIGRATION_MAIN_SHA` は移行時から不変の admission `mainSha` です。run ID と generation も元の移行から保持します。準備記録や署名済み target を新しいコード SHA に合わせて書き換えず、更新後の live data を移行時の manifest と比較しません。

`deploy-worker` は、Terraform の state も準備記録も読みません。`deploy-worker` は、D1、KV、Queue、DLQ、consumer の id を、Cloudflare API で名前から引きます。名前に一致するリソースが0件か2件以上のとき、または Cloudflare API が失敗したとき（401 と 403 を含む）は、`deploy-worker` が `stage=deploy-worker-resolve` の `IORI_DIAG` 行を出し、`wrangler deploy` の前に止まります。job が受け取る secret は、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_ZONE_ID`、`IORI_ADMISSION_IDENTITY`、`ORIGIN`、`VAPID_SUBJECT`、`IORI_CLOUDFLARE_DEPLOY_API_TOKEN` の6つです。

通常更新では backend、binding、canonical route、consumer、main Queue の配送中状態、DLQ の配送停止状態を更新前後で照合します。secret 更新、Terraform apply、データ import、source の再凍結は含めません。Wrangler は producer の Queue API を呼ぶ場合があるため、設定が変わらないことを実 readback で確認します。不確かな失敗後に自動 redeploy や producer 復元は行いません。

`reconcile-resources` と `replace-queue-consumer` は、別の保守手順をレビューするまで権限を使う前に明示的に停止します。移行の再実行や consumer の置換に流用しません。基礎 API と旧環境は保持しますが、この runbook はその保守操作を承認するものではありません。

final acceptance は次をすべて満たすまで完了としない。

- public tracked files、workflow logs、workflow summaries、artifacts が secret、ID、state、export、SQL、manifest、payload を含まない。`cloudflare:public-artifacts:check` を通す。
- Worker graph が Cloudflare-safe で、`/readyz` と custom domain の手動の確認、D1/R2/OGP aggregate count が pass する。
- ActivityPub と Web Push が機能し、Queue retry/DLQ、D1/R2 failure、delivery failure を上記 signal で観測できる。
- Terraform/Wrangler ownership boundary が確認済みである。
- 14 日の日次記録が reviewed されるまでは AWS paths を retirement 済みと扱わない。承認後にのみ別 change で cleanup を実施する。
