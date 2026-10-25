# Cloudflare 移行計画

`iori` は public repository を維持し、移行と再検証を GitHub-hosted runner の `ubuntu-latest` で実行します。Lightsail/PostgreSQL から計画停止で移行し、二重書き込みは行いません。self-hosted runner や事前配置した検証 module は必要条件にしません。

この文書は移行の案内です。実装状況、実行条件、操作手順は次の文書で管理します。以前の skeleton 実装と self-hosted runner の手順は、これらへ統合しました。

| 文書                                                                                                         | 内容                                             |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| [完全移行の設計](../../../../docs/superpowers/specs/2026-08-16-iori-cloudflare-complete-migration-design.md) | 構成、所有境界、公開情報の制約、受入基準         |
| [再開計画](../../../../docs/superpowers/plans/2026-09-05-iori-cloudflare-resume.md)                          | 実装・検証の状況と、本番操作までの残条件         |
| [データ移行手順](./cloudflare-data-migration.md)                                                             | 凍結、snapshot、D1/R2/OGP、署名と bundle の復元  |
| [Cutover runbook](./cloudflare-cutover-runbook.md)                                                           | staging、本番切替、復旧、14 日間の保持と撤去承認 |
| [Terraform の案内](../../infra/cloudflare/README.md)                                                         | generation、backend、sensitive output と管理範囲 |

## 移行後の構成

| 対象                             | 移行先                                   |
| -------------------------------- | ---------------------------------------- |
| HTTP、ActivityPub、Web Push      | Hono/Fedify を実行する Cloudflare Worker |
| アプリケーションデータ           | D1 と SQLite/Drizzle schema              |
| 投稿画像と事前生成した OGP PNG   | R2                                       |
| クライアント静的ファイル         | Workers Assets                           |
| Fedify の再構築できる一時状態    | Workers KV                               |
| 非同期配送と失敗配送             | Queues と dead-letter queue              |
| job 間の移行データと署名済み証跡 | state・アプリ画像用から分離した非公開 R2 |

Terraform は D1、R2、KV、Queue、DLQ、consumer、route を所有します。Wrangler は Worker version、binding、Assets、secret と D1 migration を所有します。Worker graph に Node server、PostgreSQL client、filesystem、`sharp` を含めません。Node は移行元とローカル開発、および runner での OGP 生成に使います。Durable Objects は初回移行には導入しません。

## 実行上の条件

- 新しい environment/generation の resource、Worker、backend key を使い、以前の state と resource を保持します。最初の Worker version は `sealed`、Queue は配送停止です。
- 移行元は受付済み HTTP と Queue transaction を完了させて永続的に凍結します。private control と既存 DB/TLS による snapshot のため、Node process は起動したままにします。
- runner ごとに新しい private root を作り、同じ署名済み bundle を非公開 R2 から復元します。別 job に前のディスクが残ることを前提にしません。
- 署名、実データの再検証、認証された読み取り専用 smoke、route の準備を経て HTTP を有効化し、Queue を最後に再開します。preview URL は無効にします。
- 途中失敗を自動再開せず、移行元の凍結も自動解除しません。復旧は runbook の明示的な判断に従います。
- 本番の接続情報、export、SQL、manifest、state、config、response body は Git、公開ログ、GitHub artifact/cache に保存しません。

実装の検証と実環境での移行は別に記録します。protected Environment の承認者・main 制限、用途別の credential、移行元への事前デプロイ、接続・容量・時間を含む匿名化 staging リハーサルを完了してから本番操作へ進みます。

cutover 後 14 日間は旧環境、backup、state と移行 bundle を保持します。通常の投稿・削除で変わる live data の監視と、保存した bundle の完全性確認を分けます。AWS 撤去と backup 削除は、それぞれの保持条件と明示承認を満たした後に別の変更で実施します。
