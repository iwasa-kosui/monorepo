# Cloudflare cutover runbook

この runbook は `iori` を Lightsail/PostgreSQL から Cloudflare Workers、D1、R2、KV、Queues へ計画停止で切り替えるための手順です。レビュー済みの commit を、保護された `production` Environment から実行します。

2026-09-06 時点では本番実行の準備が未完了です。public repository と GitHub-hosted runner の `ubuntu-latest` を使い、self-hosted runner の登録は必須条件にしません。移行 executor、非公開 R2 からの復元と hosted workflow の接続を実装し、独立レビューを完了しました。ローカル検証の結果と実行前の残条件は[再開計画](../../../../docs/superpowers/plans/2026-09-05-iori-cloudflare-resume.md)に記録します。保護設定、接続・容量・実行時間の確認、匿名化 staging rehearsal を完了してから以下を実施します。

公開リポジトリ、workflow summary、Issue、PR、terminal log に残す証跡は、論理リソース名、件数、timestamp、pass/fail、および Terraform action summary に限定します。account ID、database ID、namespace ID、Workers URL、secret、Terraform state、rendered Wrangler config、export/SQL/manifest の内容、HTTP response body は公開しません。

## 1. Cutover 前の preflight

1. 対象 commit が reviewed され、保護された `production` Environment から実行されることを確認します。required reviewer と main branch 制限を設定し、手動実行の event SHA、checkout、指定 SHA、最新 main が一致することを検査します。2026-09-06 の metadata 読み取りでは production の保護規則が未設定であり、この変更で設定済みとは扱いません。
2. `cloudflare:public-artifacts:check`、Worker typecheck、Worker bundle graph check、Terraform fmt/validate、保存済み plan の validator を通す。D1/R2 replacement または delete を含む plan は適用しない。
3. 新しい environment/generation の D1、アプリ画像用 R2、KV、Queue、DLQ、移行データ用 R2、Worker を準備します。名前と Terraform backend key も generation で分け、以前のリソースと state を保持します。Queue は配送停止かつ consumer 未接続で作成し、最初の Worker version を `sealed` にしてから停止した consumer を接続します。Worker version、deployment、binding、secret は Terraform state に入れません。
4. route が absent であり、`enable_production_worker_route=false` と `enable_staging_worker_route=false` の通常 plan では route が作られないことを確認します。切替では対象 environment に対応する一方の flag だけを有効にし、指定した hostname・zone・Worker を照合します。
5. `$RUNNER_TEMP` 配下の export/import ディレクトリが repository 外で mode `0700`、各ファイルが mode `0600` であることを確認します。生成 config と一時入力を含め、失敗時も job 終了時に削除します。
6. hosted runner からの Lightsail SSH、Cloudflare API、state・移行用 R2 への接続を検査します。信頼する SSH host key と credential は Environment から渡します。移行用 bucket は `r2.dev`、custom domain、アプリからの配信を無効にします。
7. ツール導入後の空き容量とピーク使用量、各 job の所要時間をリハーサルで確認します。同じ adapter の代表サンプルから throughput profile を作り、[データ移行手順](./cloudflare-data-migration.md)の source/runner/D1/metadata/time 上限を確認します。別の新しい runner で bundle を復元し、全データの再検証が成功することを確認します。容量不足や timeout が未解消なら本番の停止を開始しません。
8. メンテナンス中は旧 SSH deploy による再起動を抑止し、停止から切替または承認された復旧まで書き込み停止を維持します。旧 workflow の削除は AWS retirement の承認後に行います。

移行元は Node process を起動したまま、新規 HTTP の受付を止めます。受付済み HTTP の本文送信・キャンセル処理、enqueue、dequeue、handler transaction の完了と、遅延行を含む Queue の深さ `0` を確認して consumer を一時停止します。`systemd` の停止を drain の証拠にしません。レビュー済み build の SHA と指定 SHA が一致する private source control を使い、export は同じ排他制御の下で既存の DB/TLS 設定を利用します。

凍結状態は service user の home にある `.iori-migration/freeze.json` に保持します。書き込み途中の `freeze.pending` も受付を再開しない状態として扱い、プロセスの再起動で凍結を解除しません。旧 deploy は両方の marker と所有者・権限を、remote config、checkout、DB migration、restart より前に検査する必要があります。

source control の事前配備は凍結前に行います。runner 上の Node 24.12.0 と reviewed SHA の clean tracked checkout から build し、remote checkout もその SHA に固定して、control CLI と依存する全 library を揃えます。remote では `$HOME/.nvm/versions/node/v24.12.0/bin/node` と `$HOME/.local/share/pnpm/pnpm` を使います。固定 pnpm は実体・所有者・実行権限と version `10.12.4` を検査します。未知の配置や symlink を見つけた場合に、自動で別の実行ファイルへ切り替えません。必要なホスト修正は事前配備の前提として別途確認します。

転送先 `dist` の実体・所有者を転送前に確認し、配布したファイルの相対 path、size、SHA-256 と build SHA を再起動前に照合します。symlink、欠落、破損、余分なファイルがある場合は先へ進みません。

既存の source-side `env.conf` と DB TLS 設定を保持し、この schema 変更を伴わない事前配備で `drizzle:push` は行いません。稼働後の status が返す build SHA も照合します。失敗時は後続の config 更新と restart を停止し、自動再起動で復旧しません。

旧 deploy と移行 workflow は同じ source concurrency を共有し、setup 後にも marker を再検査します。これは管理対象の workflow の競合を防ぐための制御です。operator が同時に別経路から freeze/deploy を実行する場合の原子的な lock ではないため、手動操作を競合させない運用を守ります。

source 用 `.github/workflows/deploy-iori.yml` は対象 path の `main` push と手動実行の入口を保持します。PR の merge で job が起動し得るため、source credential を供給して merge する前に `production` の required reviewer と `main` 制限を設定します。Environment 名の追加だけでは実行承認は強制されません。移行 workflow の手動切替と、merge を契機に起動する source 配備を区別して承認します。

## 2. Staging rehearsal

staging は production と異なる D1、R2、KV、Queue、DLQ、Worker name と backend key を使い、匿名化済みのデータだけを投入します。Worker の `SMOKE_QUEUE_TOKEN` と smoke runner の `IORI_SMOKE_QUEUE_TOKEN` は同じ値を使います。token は Queue enqueue を含む全 smoke request に必要で、command argument、output、summary、repository に表示・保存しません。

`smoke` 状態では完全な checklist の対象だけを読み取り専用で許可します。Queue への送信は同じ environment/generation/SHA/run を持つ専用 marker に限定し、通常の配送は停止したままです。staging の通常操作の確認には、`active` 状態の確認済み hostname と、smoke とは別の `STAGING_ACCESS_TOKEN` を使います。その後も通常のユーザー認証は必要です。rehearsal では次を順に実施します。

smoke/staging token はそれぞれ異なる 16〜1,024 文字のランダムな ASCII 文字列を設定します。短すぎる token や長すぎる request header は Worker が拒否します。値の存在だけで smoke が利用可能とは扱わず、staging で実際の認証を確認します。

1. staging の新しい generation を `sealed`、Queue 配送停止、route 未作成で準備し、準備記録を照合します。
2. repository 外の匿名化済み PostgreSQL/upload fixture で export、D1 SQL conversion、R2 import を rehearsal する。D1 row count と R2 checksum を照合し、公開 article の OGP PNG を `og/<article-id>.png` に backfill する。
3. Fedify PostgreSQL queue の drain 手順を rehearsal する。Cloudflare KV は空の状態から始め、Queue consumer の retry と DLQ 到達を fixture message で確認する。
4. 別の新しい runner で bundle と実データを再検証します。`sealed` から `smoke` へ移し、route を作成する前に workers.dev hostname で全 checklist を実行します。preview URL は無効にします。

```bash
pnpm --filter @iwasa-kosui/iori exec node scripts/run-cloudflare-smoke.mjs \
  --base-url "$IORI_SMOKE_BASE_URL" \
  --expected-origin "$IORI_SMOKE_EXPECTED_ORIGIN" \
  --allowed-hostname "$IORI_SMOKE_ALLOWED_HOSTNAME" \
  --checks-json "$IORI_SMOKE_CHECKS_JSON"
```

`IORI_SMOKE_QUEUE_TOKEN` はプロセスの環境変数で渡します。runner は status、content type、JSON の構造だけを検査し、redirect を追跡しません。response body、URL、credential は result と summary に含めません。checklist は health、D1/R2/KV/Queue binding readiness、static asset、認証拒否、WebFinger、actor/outbox/inbox、upload retrieval、OGP PNG、Queue enqueue、Web Push public key を含みます。

5. `smoke` のまま staging route を準備して実状態を読み戻し、staging の canonical hostname で完全な smoke checklist を再実行します。その成功後に source freeze と同じ target identity を再確認して HTTP を `active` にします。Queue を最後に再開し、有効化後にも完全な smoke を行います。staging の通常認証を通して sign-in/sign-up、timeline、post/reply/delete、upload/image retrieval、ActivityPub follow/like/repost/undo/relay、Queue retry/DLQ、Web Push、OGP PNG を手動確認します。記録は counts、timestamp、pass/fail だけにします。

route creation に進むためには、schema migration、D1 row-count verification、R2 checksum verification、OGP backfill、queue drain rehearsal、workers.dev smoke のすべてが pass でなければならない。

## 3. Production cutover

以下の順序は変更しない。

1. メンテナンスを告知し、準備済み generation の記録、独立した Terraform の期待値、現在の sealed Worker、binding、配送停止を照合します。KV は準備時から空の状態を維持します。
2. 移行元と runner の容量・所要時間を検査し、実行 ID を一度だけ予約します。
3. Lightsail の新規 HTTP を止め、受付済み HTTP と Queue transaction を drain します。遅延行を含む深さ 0 と配送停止を再検査し、凍結を保持します。
4. 同一 PostgreSQL snapshot と参照画像を export・転送し、全データを D1 SQL に変換します。すべての SQL が検査を通るまで D1 を変更しません。
5. 同じ generation の空の D1 を確認し、schema migration と生成したすべての SQL を順に投入します。
6. R2 の元画像と公開記事の OGP PNG を投入します。
7. counts/checksum/objects を実際の D1/R2 と照合し、成功した各処理の署名付き証跡と移行 bundle を非公開 R2 へ保存します。全転送と照合後に完了 marker を保存します。
8. 別の新しい runner の `verify-import` で同じ bundle を復元し、署名、全ファイル、D1/R2/OGP の実データを再検証します。Worker はこの時点まで `sealed` を維持します。
9. Worker を `smoke` に移し、認証された workers.dev の全 checklist を読み取り専用で検査します。
10. `smoke` の受付制限を維持したまま、検査済みの同じ route plan を apply します。canonical hostname の全 checklist も確認します。
11. 移行元の凍結と、同じ SHA、run ID、generation、現在の version、binding を再確認し、確認済みの本番 hostname の HTTP を `active` にします。
12. Queue の配送を最後に再開し、実 API の readback と canonical hostname の smoke を確認します。
13. sign-in、timeline、post、reply、deletion、upload、ActivityPub、follow、like、repost、relay、Web Push を手動で確認します。

実行中の workflow summary には各 step の pass/fail、timestamp、aggregate count だけを記録する。DB row、R2 key、checksum 値、response body、URL、ID、secret を記録しない。

## 4. Rollback

移行に失敗しても Lightsail の書き込みを自動再開しません。route 作成前であっても、失敗した実行 ID、部分的な import、移行先の受付状態を確認します。再起動だけでは永続的な凍結は解除されません。移行先への通常書き込みを有効にしていないと確認し、復旧を明示的に承認した場合だけ、同じ SHA と run ID の source control に `resume` と `destination_writes_not_enabled` を指定します。

HTTP を有効にした後は移行先の受付と配送を止め、移行先での復旧を優先します。D1/R2 に通常書き込みが発生した場合、その変更を照合・反映し終わるまで Lightsail の書き込みを再開しません。承認された復旧では `resume` に `destination_writes_reconciled` を指定します。これらの指定は operator の復旧判断であり、自動処理が推測して送信してはいけません。公開記録は件数と pass/fail に限定します。

## 5. 14-day retention と AWS retirement

cutover 後 14 日間は Lightsail、PostgreSQL、upload backup、AWS state を保持します。

移行 bundle も cutover 完了から少なくとも 14 日間、非公開 R2 に保持します。export 時点からの一律 TTL は設定せず、進行中・失敗中の run も自動削除しません。照合結果と保持期間を確認し、削除承認後に cleanup します。

この期間は毎日、次を記録します。

- public smoke result（`/readyz` を含む）
- 現在の D1/R2 件数と object retrieval の結果、および正常な投稿・削除で説明できない変化
- Fediverse delivery と Web Push の成功/失敗 aggregate
- Queue retry/DLQ status と consumer failure aggregate
- Worker、D1、R2 の error aggregate

日次記録には日付、論理リソース名、aggregate count、pass/fail だけを残す。request/response body、object key、checksum 値、URL、ID、SQL、export/manifest、token を記録しない。

移行時の count/checksum の完全一致は、通常書き込みを有効にする前の受入れ条件です。cutover 後の投稿・画像追加・削除は live data を変更するため、日次確認で移行時の manifest との完全一致を要求しません。保存した移行 bundle の完全性と保持状態は、現在のアプリデータの監視とは別に確認します。日次 backup や alert が設定済みとは扱わず、担当者と実際の設定を cutover 前に確認します。

14 日分の evidence が完了し、destroy plan が reviewed・明示承認された場合だけ、AWS retirement を承認する。承認前に Lightsail workflow、AWS state、backup、secret reference を削除・破棄してはいけない。この変更は retention evidence や destroy approval を記録するものではないため、旧 deploy path は保持する。

承認後の cleanup は次の独立した reviewed change で実施する。

1. evidence の 14 日分と destroy plan の承認を確認し、public summary には pass/fail と日付だけを残す。
2. Lightsail が public traffic、write path、background delivery path のいずれにも入っていないことを smoke と aggregate metrics で確認する。
3. `.github/workflows/deploy-iori.yml`、Lightsail deploy scripts、AWS resource definitions、SSH/database/Node production secret references を削除する。local Node/PostgreSQL development が Worker deploy graph から到達不能なら残してよい。
4. backup は別途 retention approval がない限り削除しない。
5. `cloudflare:public-artifacts:check` と repository quality suite を実行し、旧 path を消した commit を reviewed する。

## 6. 運用 signal、alert、ownership

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

## 7. Terraform/Wrangler ownership と最終受入れ

staging/production import 後に、secure runner で Terraform state と saved plan を確認します。Terraform の管理対象は D1、R2、KV、Queue、DLQ、Queue consumer、route に限定します。Worker version/deployment/binding/secret は state に含めず、Wrangler が Worker version と producer binding を管理します。Wrangler config に Queue consumer 定義を置きません。route は cutover plan 前には `absent`、`cutover-route` の reviewed plan 後に `present` とします。本番の Terraform 操作には `TF_VAR_public_hostname` を渡します。state/plan/config の生データは公開しません。

Worker binding は GitHub の個別 ID/name secret から渡さず、Terraform sensitive `worker_bindings` output を各 job の mode `0600` ファイルへ生成します。protected Worker name と output の worker name が一致すること、saved plan の `worker_bindings` output が no-op であることを deploy 前に検証します。移行データは専用の非公開 R2 から `$RUNNER_TEMP` 配下へ復元します。Environment は接続設定と鍵を供給し、永続ホスト上の絶対パスを渡す方式から変更します。config は各 job で再生成し、bundle に含めません。内容は log、summary、GitHub artifact、cache に出しません。

新規 generation の準備、source drain/export、D1 conversion/import、R2/OGP import、実データ検証は protected Environment の GitHub-hosted runner で行います。以下の CLI は Node 24.12.0 で `apps/iori` から実行します。workflow が各 job の private input と権限を用意し、任意の module や remote command は受け付けません。

| CLI                                       | 役割                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `scripts/prepare-migration-target.mjs`    | 新規リソース、sealed Worker、配送停止の consumer を準備し、実 readback 後に準備記録を条件付き保存する                     |
| `scripts/read-migration-target.mjs`       | 指定済み backend の output から独立した expected target を private file に生成する。既存 state の apply/import は行わない |
| `scripts/execute-protected-migration.mjs` | 事前検査・実行予約から source 凍結、全実 import、検証、署名付き bundle 保存までを実行する                                 |
| `scripts/restore-protected-migration.mjs` | 別の空の private root に全 bundle を復元し、署名・準備時の状態・現在の実データを再検証する                                |
| `scripts/cutover-migration.mjs`           | 同じ job/process 内で fresh restore と実検証を行い、smoke、route、HTTP 有効化、Queue 配送再開を順に実行する               |
| `scripts/deploy-active-worker.mjs`        | 現在 active の同じ generation へ reviewed code を一度 deploy し、version・route・Queue 設定を更新前後で照合する           |
| `scripts/deploy-source.mjs`               | 凍結前の source control 事前配備を、固定 SSH/rsync と成果物検証・build SHA 照合で実行する                                 |

`IORI_ENVIRONMENT`、`IORI_GENERATION`、`MAIN_SHA`、`IORI_MIGRATION_RUN_ID`、`IORI_TERRAFORM_BACKEND_BUCKET` と admission identity を同じ実行へ固定します。generation は先頭が小文字英字、残りが小文字英数字の 8〜20 文字で、再利用しません。run ID は英数字・underscore・hyphen の 1〜80 文字です。backend key は `iori/<environment>/<generation>/terraform.tfstate` から変更しません。旧リソースの adoption、state move、destroy はこの経路に含めません。

`IORI_MIGRATION_EXPECTED_TARGET_PATH` は independently selected Terraform output から生成します。bundle の値を期待値として採用せず、account、backend、Worker、全リソースの ID と consumer の対応を照合します。64 KiB 以下の準備記録は専用 bucket の `prepared-target/v1/<environment>/<generation>/record.json` に固定し、条件付き保存後に同じ bytes を読み戻します。準備 job に署名用秘密鍵は渡しません。

contract は `iori-protected-migration-contract/v3`、証跡は v3、executor receipt は v1 です。contract の `main_sha`、`run_id`、各 phase の `previous_evidence_hash`、完了状態、artifact と署名を検査します。署名対象は root 相対パス、size、SHA-256 で結び付け、全ファイルを mode `0600` の通常ファイルとします。復元先 root を変えても署名済み bytes を変更せず、絶対パス、`..`、symlink、旧 contract を拒否します。

bundle には全 31 application table の NDJSON、全 SQL file、各 manifest、署名付き証跡が必要です。source inventory、生成 config、秘密鍵、Terraform state/plan は移行 bundle に含めません。bundle 自体も非公開 R2 に限定し、GitHub artifact や cache へ保存しません。実行予約と公開予約の衝突、または PUT の結果が不明な場合は失敗とし、予約や部分データを保持して自動再実行しません。

verifier は hash chain、署名、各ファイルの存在・権限・サイズ・checksum と、実際の D1/R2/OGP を照合します。provider はレビュー済み SHA 内の固定コードです。先行する `verify-import` に加え、`cutover-route` の job 内でも空の root から復元・署名・実データ検証を行います。その同じ process で現在の sealed version を確認してから `smoke` へ移します。先行 job の成功表示だけでは切替を許可しません。準備時の sealed version は不変の履歴として保持し、route/activation の現在 version は別に追跡します。後続の状態に合わせて準備記録や署名済み証跡を更新しません。

各 job の最初の step で記録する `IORI_JOB_STARTED_AT` を期限の起点とし、checkout・setup・build も 5 時間 45 分の予算に含めます。切替 job の復元・検証には HTTP/Queue 有効化用の 15 分を残し、検証後に残時間を再計算します。復元成功後に期限を超えても、起点をリセットして切替を続行しません。期限や OS signal による中断は内部の command に伝え、その終了と cleanup を待ちます。

Terraform/Wrangler/SSH の raw output は private file に捕捉します。Terraform の setup wrapper は無効にし、private plan は意味を検査してから固定の status/action count だけを公開します。公開出力の guard と実コマンドの終了 status を別々に確認し、失敗を成功へ変換しません。

executor receipt は Ed25519 の detached signature を必要とします。signer は phase command、exit status、argv/artifact digest、queue depth、main SHA、run ID に署名します。秘密鍵は移行 job に限定して Environment から供給し、repository・workflow log・GitHub artifact・R2 bundle に置きません。公開鍵と SHA-256 の pin も Environment を信頼元として受け取り、各 job の外部 private file に生成します。execute/restore CLI は bundle と provider へ接続する前に鍵を検査し、不一致や未設定を拒否します。hosted workflow が先に行う最新 main と読み取り専用 target の確認は、この鍵検査とは別の事前処理です。bundle 内の鍵は信頼元にしません。検証 job は公開鍵と読み取り権限だけを持ちます。

各 job に渡す権限は役割ごとに分けます。API token と S3 credential は用途と対象 bucket を限定し、存在する Environment 名だけを保護設定の完了とみなしません。

| 役割             | 必要な権限・入力                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 準備             | 新規リソース・sealed Worker・secret・停止 consumer の作成、state 更新、準備記録の保存                                                       |
| 移行             | state 読み取り、D1/R2 import、移行 bundle 保存、source control 用 SSH、実測 profile、署名用秘密鍵と公開鍵の pin                             |
| 再検証           | state・移行 bundle・D1/R2 と現在の Worker/Queue の読み取り、公開鍵と pin                                                                    |
| 切替             | job 内の再検証に必要な読み取り、smoke token、source 凍結の照合、Worker/route/Queue と state の更新                                          |
| 通常 Worker 更新 | 現在の generation と route/Queue/state の読み取り、Worker と既存 Queue producer の deploy。移行時の identity と現在の code SHA を別々に指定 |
| source 事前配備  | 固定 SSH/rsync、信頼済み host key、reviewed SHA の成果物。既存 source-side DB/TLS 設定を利用                                                |

D1 の再検証には `D1 Read` が利用できます。state、移行 bundle、application object の読み取り用 credential を、それぞれの書き込み用 credential から分けます。[D1 query API の権限](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)

現行 tracked tree は public artifact gate で安全化する。過去の公開 history に残る旧 production identifier は credential として扱わないが、必要に応じて credential rotation と approved history purge を別途 reviewed change で実施する。この移行変更では destructive history rewrite を実行しない。

workers.dev と切替後の custom-domain smoke は、protected queue token を必須とする完全な checklist を使います。health/healthz/readyz、asset/auth/ActivityPub、R2/OGP、Queue enqueue、Web Push の検査は省略できません。ユーザー、画像、記事の検査対象は、その環境に存在するデータへ変更します。fixture のユーザー名やゼロ UUID のまま本番検証を開始しません。

切替前の workers.dev と切替後の custom domain は別々の確認済み hostname として管理します。smoke は admission identity と対応する hostname だけに送信し、route 作成後は canonical hostname でも全 checklist を確認します。

切替後の `deploy-worker` は、現在 `active` の同じ generation への通常更新に限定します。`MAIN_SHA` は今回の checkout/build を制御する reviewed current-main SHA、`IORI_MIGRATION_MAIN_SHA` は移行時から不変の admission `mainSha` です。run ID と generation も元の移行から保持します。準備記録や署名済み target を新しいコード SHA に合わせて書き換えず、更新後の live data を移行時の manifest と比較しません。

通常更新では backend、binding、canonical route、consumer、main Queue の配送中状態、DLQ の配送停止状態を更新前後で照合します。secret 更新、Terraform apply、データ import、source の再凍結は含めません。Wrangler は producer の Queue API を呼ぶ場合があるため、設定が変わらないことを実 readback で確認します。不確かな失敗後に自動 redeploy や producer 復元は行いません。

`reconcile-resources` と `replace-queue-consumer` は、別の保守手順をレビューするまで権限を使う前に明示的に停止します。移行の再実行や consumer の置換に流用しません。基礎 API と旧環境は保持しますが、この runbook はその保守操作を承認するものではありません。

final acceptance は次をすべて満たすまで完了としない。

- public repository の hosted runner で停止から移行、bundle 保存、別 job での復元と実データ再検証が成功します。事前配置したホストのパスを必要としません。
- public tracked files、workflow logs、workflow summaries、artifacts が secret、ID、state、export、SQL、manifest、payload を含まない。`cloudflare:public-artifacts:check` を通す。
- Worker graph が Cloudflare-safe で、`/readyz`、custom-domain smoke、D1/R2/OGP aggregate count が pass する。
- ActivityPub と Web Push が機能し、Queue retry/DLQ、D1/R2 failure、delivery failure を上記 signal で観測できる。
- Terraform/Wrangler ownership boundary と route の absent/present gate が確認済みである。route apply 前の workers.dev smoke と apply 後の protected custom-domain smoke がともに pass している。
- 14 日の日次記録が reviewed されるまでは AWS paths を retirement 済みと扱わない。承認後にのみ別 change で cleanup を実施する。
