# Cloudflare cutover runbook

この runbook は `iori` を Lightsail/PostgreSQL から Cloudflare Workers、D1、R2、KV、Queues へ計画停止で切り替えるための手順です。レビュー済みの commit を、保護された `production` Environment から実行します。

2026-09-05 時点では実行準備が未完了です。public repository を維持し、GitHub-hosted runner の `ubuntu-latest` を使う方針へ修正しました。[再開計画](../../../../docs/superpowers/plans/2026-09-05-iori-cloudflare-resume.md)に、workflow の対応、保護設定、接続・容量の確認、移行 executor と R2 からのデータ復元の実装を記載しています。self-hosted runner の登録は必須条件にしません。現行 `migrate-data` は完了済み証跡の検証であり、export/import を開始する操作ではありません。以下の hosted runner 向け手順は、その実装とリハーサル後に使います。

公開リポジトリ、workflow summary、Issue、PR、terminal log に残す証跡は、論理リソース名、件数、timestamp、pass/fail、および Terraform action summary に限定します。account ID、database ID、namespace ID、Workers URL、secret、Terraform state、rendered Wrangler config、export/SQL/manifest の内容、HTTP response body は公開しません。

## 1. Cutover 前の preflight

1. 対象 commit が reviewed され、protected `production` environment から実行されることを確認する。
2. `cloudflare:public-artifacts:check`、Worker typecheck、Worker bundle graph check、Terraform fmt/validate、保存済み plan の validator を通す。D1/R2 replacement または delete を含む plan は適用しない。
3. 既存の D1、R2、KV、Queue、DLQ、Queue consumer を import し、移行データ用の非公開 R2 bucket を準備します。Terraform state がこれらと route だけを所有し、import 手順と plan validator も移行用 bucket に対応していることを確認します。Worker version、deployment、binding、secret は state に入れません。
4. production route が absent であり、`enable_production_worker_route=false` の通常 plan では route が作られないことを確認する。
5. `$RUNNER_TEMP` 配下の export/import ディレクトリが repository 外で mode `0700`、各ファイルが mode `0600` であることを確認します。生成 config と一時入力を含め、失敗時も job 終了時に削除します。
6. hosted runner からの Lightsail SSH、Cloudflare API、state・移行用 R2 への接続を検査します。信頼する SSH host key と credential は Environment から渡します。移行用 bucket は `r2.dev`、custom domain、アプリからの配信を無効にします。
7. ツール導入後の空き容量とピーク使用量、各 job の所要時間をリハーサルで確認します。別の新しい runner で bundle を復元し、全データの再検証が成功することを確認します。容量不足や timeout が未解消なら本番の停止を開始しません。
8. メンテナンス中は旧 SSH deploy による再起動を抑止し、停止から切替または rollback まで書き込み停止を維持します。旧 workflow の削除は AWS retirement の承認後に行います。

## 2. Staging rehearsal

staging は production と異なる D1、R2、KV、Queue、DLQ、Worker name を使う。fixture D1/R2/KV/Queue 以外には接続しない。Queue enqueue smoke は protected `SMOKE_QUEUE_TOKEN` が設定されている場合だけ、`POST /__smoke__/queue-enqueue` を公開する。production Worker deploy と protected smoke runner は同じ protected `IORI_SMOKE_QUEUE_TOKEN` を使う。この token は command output、workflow summary、repository に表示・保存しない。rehearsal では次を順に実施する。

1. remote D1 schema migration を staging に適用する。
2. repository 外の匿名化済み PostgreSQL/upload fixture で export、D1 SQL conversion、R2 import を rehearsal する。D1 row count と R2 checksum を照合し、公開 article の OGP PNG を `og/<article-id>.png` に backfill する。
3. Fedify PostgreSQL queue の drain 手順を rehearsal する。Cloudflare KV は空の状態から始め、Queue consumer の retry と DLQ 到達を fixture message で確認する。
4. workers.dev preview に Worker を deploy し、route を作成する前に smoke を実行する。runner には staging fixture の path だけを渡す。

```bash
pnpm --filter @iwasa-kosui/iori exec node scripts/run-cloudflare-smoke.mjs \
  --base-url "$IORI_SMOKE_BASE_URL" \
  --expected-origin "$IORI_SMOKE_EXPECTED_ORIGIN" \
  --allowed-hostname "$IORI_SMOKE_ALLOWED_HOSTNAME" \
  --checks-json "$IORI_SMOKE_CHECKS_JSON" \
  --smoke-queue-token "$IORI_SMOKE_QUEUE_TOKEN"
```

runner は status、content type、JSON の構造だけを検査し、cross-origin redirect を拒否する。response body、URL、credential は result に含めず、summary に出力しない。fixture checklist は health、D1/R2/KV/Queue binding readiness、static asset、認証拒否、WebFinger、actor/outbox/inbox、upload retrieval、OGP PNG、Queue enqueue、Web Push public key を含む。

5. staging で sign-in/sign-up、timeline、post/reply/delete、upload/image retrieval、ActivityPub follow/like/repost/undo/relay、Queue retry/DLQ、Web Push、OGP PNG を手動確認する。記録は counts、timestamp、pass/fail のみとする。

route creation に進むためには、schema migration、D1 row-count verification、R2 checksum verification、OGP backfill、queue drain rehearsal、workers.dev smoke のすべてが pass でなければならない。

## 3. Production cutover

以下の順序は変更しない。

1. メンテナンスを告知する。
2. Lightsail app writes を停止する。
3. Fedify PostgreSQL queue を drain し、深さ 0 を確認して配送処理を停止する。
4. PostgreSQL と uploads を export する。
5. D1 schema migration を適用する。
6. D1 SQL を convert/import する。
7. R2 objects を import する。
8. OGP を backfill する。
9. counts/checksum/objects を verify し、署名付き証跡と移行 bundle を非公開 R2 へ保存します。全転送と照合後に完了 marker を保存します。
10. Cloudflare KV を空の状態で開始する。
11. workers.dev で Worker を validate する。
12. 別の新しい runner の `verify-import` で同じ bundle を復元し、署名と D1/R2/OGP の実データを再検証してから、保存済みの route plan を apply します。
13. public smoke checks を実行する。
14. sign-in、timeline、post、reply、deletion、upload、ActivityPub、follow、like、repost、relay、Web Push を手動で verify する。

実行中の workflow summary には各 step の pass/fail、timestamp、aggregate count だけを記録する。DB row、R2 key、checksum 値、response body、URL、ID、secret を記録しない。

## 4. Rollback

route creation 前は Lightsail を restart して rollback する。Cloudflare 側を write target にしていないため、export/import artifact を再利用して Lightsail を変更してはいけない。

route creation 後は Worker を maintenance mode にし、forward recovery を優先する。D1/R2 に書き込みが発生した場合、D1/R2 writes を手動で reconcile して verify するまで Lightsail writes を再開しない。reconcile 結果も count と pass/fail だけを記録する。

## 5. 14-day retention と AWS retirement

cutover 後 14 日間は Lightsail、PostgreSQL、upload backup、AWS state を保持します。

移行 bundle も cutover 完了から少なくとも 14 日間、非公開 R2 に保持します。export 時点からの一律 TTL は設定せず、進行中・失敗中の run も自動削除しません。照合結果と保持期間を確認し、削除承認後に cleanup します。

この期間は毎日、次を記録します。

- public smoke result（`/readyz` を含む）
- D1 row-count verification と R2 object retrieval/checksum verification の aggregate count
- Fediverse delivery と Web Push の成功/失敗 aggregate
- Queue retry/DLQ status と consumer failure aggregate
- Worker、D1、R2 の error aggregate

日次記録には日付、論理リソース名、aggregate count、pass/fail だけを残す。request/response body、object key、checksum 値、URL、ID、SQL、export/manifest、token を記録しない。

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
| Daily data count                       | D1 row/R2 object/OGP count mismatch                | cutover manifest と secure verification result を照合し、公開記録には count/pass-fail のみ残す     |

アラート設定の変更、threshold、DLQ replay、route rollback は production environment approval を必要とする。手順を実施した on-call は timestamp、logical resource、aggregate count、pass/fail、次の owner だけを redacted summary に記録する。

## 7. Terraform/Wrangler ownership と最終受入れ

staging/production import 後に、secure runner で Terraform state と saved plan を確認します。Terraform の管理対象は D1、R2、KV、Queue、DLQ、Queue consumer、route に限定します。Worker version/deployment/binding/secret は state に含めず、Wrangler が Worker version と producer binding を管理します。Wrangler config に Queue consumer 定義を置きません。route は cutover plan 前には `absent`、`cutover-route` の reviewed plan 後に `present` とします。`reconcile-resources` と `replace-queue-consumer` では `production_route` に切替前は `absent`、切替後は `present` を指定し、route の削除を防ぎます。本番の Terraform 操作には `TF_VAR_public_hostname` を渡します。state/plan/config の生データは公開しません。

Worker binding は GitHub の個別 ID/name secret から渡さず、Terraform sensitive `worker_bindings` output を各 job の mode `0600` ファイルへ生成します。protected Worker name と output の worker name が一致すること、saved plan の `worker_bindings` output が no-op であることを deploy 前に検証します。移行データは専用の非公開 R2 から `$RUNNER_TEMP` 配下へ復元します。Environment は接続設定と鍵を供給し、永続ホスト上の絶対パスを渡す方式から変更します。config は各 job で再生成し、bundle に含めません。内容は log、summary、GitHub artifact、cache に出しません。

既存リソースの import、Queue drain、PostgreSQL export、D1 conversion/import、R2/OGP import、移行結果の検証は protected Environment の GitHub-hosted runner で実行します。`migrate-data` には新設する executor と bundle 保存を接続し、既存 verifier だけを呼ぶ状態を解消します。contract には `main_sha`、`migration_run_id`、各 phase の `previous_evidence_hash`、完了状態と署名付き証跡を記録します。証跡ファイルは mode `0600` の通常ファイルとし、path、size、SHA-256、各処理が生成した artifact との対応を検査します。

新しい contract version では、署名対象のファイル参照を bundle 内の相対パスに変更します。復元先 root は job ごとに指定し、署名済み bytes を変更しません。絶対パス、`..`、symlink による root 外参照と旧 contract を拒否します。現行コードは絶対パスを含むため、この変更は未実装です。bundle には全 application table の NDJSON、各 manifest、署名付き証跡と参照する全 artifact が必要で、manifest だけの復元では検証できません。全転送と照合が完了した同一 SHA・run ID の bundle だけを受け付け、完了済みデータは上書きしません。

verifier は hash chain、署名、ファイルの存在・権限・サイズ・checksum を検査します。export と D1/R2/OGP manifest は既存 CLI が生成する形式で検査し、実行証跡とは区別します。Queue drain report では深さ `0` を確認します。検証先を読む provider module はレビュー済み SHA に含まれる repository 内のコードを使い、外部 module のパスと digest を渡す方式から変更します。`cutover-route` は同じ contract と実データを `verify-import` job で再検証し、SHA や run ID が一致しなければ route を変更しません。raw output は redaction gate を通し、公開 summary に証跡の内容を残しません。

executor receipt は Ed25519 の detached signature を必要とします。signer は phase command、exit status、argv/artifact digest、queue depth、main SHA、run ID に署名します。秘密鍵は移行 job に限定して Environment から供給し、repository・workflow log・GitHub artifact・R2 bundle に置きません。検証 job は Environment を信頼元として公開鍵とその SHA-256 を受け取り、repository 外の mode `0600` ファイルへ生成します。既存の公開鍵パス入力もこの一時ファイルを指すように変更します。未設定または不一致なら処理を停止し、bundle 内の鍵を信頼元にしません。

現行 tracked tree は public artifact gate で安全化する。過去の公開 history に残る旧 production identifier は credential として扱わないが、必要に応じて credential rotation と approved history purge を別途 reviewed change で実施する。この移行変更では destructive history rewrite を実行しない。

workers.dev と切替後の custom-domain smoke は、protected queue token を必須とする完全な checklist を使います。health/healthz/readyz、asset/auth/ActivityPub、R2/OGP、Queue enqueue、Web Push の検査は省略できません。ユーザー、画像、記事の検査対象は、その環境に存在するデータへ変更します。fixture のユーザー名やゼロ UUID のまま本番検証を開始しません。

deploy-worker の pre-route smoke origin は protected `IORI_SMOKE_ALLOWED_HOSTNAME` と一致させる。workers.dev hostname と custom-domain hostname は別に管理し、route cutover 後の custom-domain smoke は Terraform protected hostname を allowlist とする。

final acceptance は次をすべて満たすまで完了としない。

- public repository の hosted runner で停止から移行、bundle 保存、別 job での復元と実データ再検証が成功します。事前配置したホストのパスを必要としません。
- public tracked files、workflow logs、workflow summaries、artifacts が secret、ID、state、export、SQL、manifest、payload を含まない。`cloudflare:public-artifacts:check` を通す。
- Worker graph が Cloudflare-safe で、`/readyz`、custom-domain smoke、D1/R2/OGP aggregate count が pass する。
- ActivityPub と Web Push が機能し、Queue retry/DLQ、D1/R2 failure、delivery failure を上記 signal で観測できる。
- Terraform/Wrangler ownership boundary と route の absent/present gate が確認済みである。route apply 前の workers.dev smoke と apply 後の protected custom-domain smoke がともに pass している。
- 14 日の日次記録が reviewed されるまでは AWS paths を retirement 済みと扱わない。承認後にのみ別 change で cleanup を実施する。
