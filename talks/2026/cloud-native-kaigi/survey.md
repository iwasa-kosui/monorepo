# クラウドネイティブ会議 2026 プロポーザル動向調査レポート

## 1. イベント概要

### クラウドネイティブ会議 2026 (CNK2026)

| 項目 | 内容 |
|------|------|
| 開催日 | 2026年5月14-15日 |
| 場所 | 名古屋・中日ホール&カンファレンス |
| CFP期間 | 2026年2月2日〜3月1日 |
| 構成 | CloudNative Days / Platform Engineering Kaigi / SRE Kaigi の3トラック合同 |
| 登壇形式 | 現地登壇のみ（事前収録不可） |

### 3トラックの棲み分け

| トラック | 開催日 | 対象テーマ |
|---------|--------|-----------|
| CloudNative Days | 5月14日 | Kubernetes・コンテナ・CNCF系技術 |
| Platform Engineering Kaigi | 5月15日 | IDP・開発者体験・セルフサービス基盤 |
| SRE Kaigi | 5月15日 | SLO/SLI設計・Observability・インシデント管理 |

### 過去の開催実績

| イベント名 | 開催日 | 場所 | テーマ |
|---|---|---|---|
| CloudNative Days Summer 2025 (CNDS2025) | 2025年5月23日 | 沖縄県那覇市 | Passion 〜CloudNativeに熱中する〜 |
| CloudNative Days Winter 2025 (CNDW2025) | 2025年11月18-19日 | 東京・有明セントラルタワーホール | Scaling Together |

---

## 2. CNDW2025（前回大会）の採択セッション分析

### カテゴリ別分布（全62セッション）

| カテゴリ | セッション数 | 割合 | 備考 |
|----------|------------|------|------|
| Architecture Design | 約13 | **最多** | アーキテクチャ設計全般 |
| Operation / Monitoring / Logging | 約10 | 多い | OTel関連が目立つ |
| Application / Development | 約7 | 中程度 | |
| Security | 約6 | 中程度 | サプライチェーン系 |
| Networking | 約5 | 中程度 | |
| CI / CD | 約4 | 中程度 | |
| その他（ML/HPC、IoT/Edge、組織論など） | 約17 | 多様 | 業界横断的 |

### 主要な採択セッション一覧

#### Day 1（11月18日）

- 「米軍Platform One/Black Pearlに学ぶ極限環境DevSecOps：イージス艦からF-35まで」
- 「CloudNativeな車を作る 〜進化し続ける車を作りたい〜」
- 「転職したら勘定系システムのクラウド化担当だった件」
- 「オブザーバビリティの哲学」
- 「クラウドネイティブな推論環境によるオープンソースLLMの実用性検証」
- 「LLM時代のDevOps：プロンプトのバージョン管理からモデルのデプロイまで」
- 「Datadog LLM Observabilityで実現するLLMOps実践事例」
- 「100クラスター規模のマルチテナント環境を支えるOpenTelemetry Collector」
- 「セキュアなAIエージェントアプリケーションとは？」
- 「Progressive Deliveryで支える！スケールする衛星コンステレーション」
- 「アラートだけでここまで分析できるの？AI Agent」
- 「Konveyor AI 降臨!! ローカルLLMを活用してレガシーJava移行」
- 「改竄して学ぶコンテナサプライチェーンセキュリティ」
- 「containerlab × kind で再現するBGP + Kubernetes環境」
- 「ECSで満足していたのに、なぜEKSへ？」

#### Day 2（11月19日）

- 「世界とつながる日本のクラウドネイティブ 〜CNCFと日本初のKubeConとその先へ〜」
- 「『ゼルダの伝説 ティアーズ オブ ザ キングダム』の開発を支えたクラウド環境」
- 「クラウドネイティブ時代に進化し続けるFluentd」
- 「CNI徹底解説 〜思想と実装から読み解くコンテナネットワーク」
- 「単一Kubernetesクラスタで実現するAI/ML向けクラウドサービス」
- 「AppleのContainerization Frameworkから学ぶコンテナ技術」
- 「病院向け搬送ロボット「Potaro」の多台数統括システム」
- 「Amazon SageMakerを活用した「顧客が自走できる」ML開発基盤」
- 「Kubernetes Controller をシャーディングでスケールアウト」
- 「老舗SaaS運用の舞台裏〜AWS EoL対応地獄から主導権を奪還」
- 「Crossplane導入で拓くKubernetesプラットフォーム開発」
- 「Dev Containers と Skaffold で実現するクラウドネイティブ開発環境」
- 「一週間で作る低レイヤコンテナランタイム」
- 「ABEMAのCM配信を支えるスケーラブルな分散カウンタ」
- 「Secure AWS Access from On-Prem Kubernetes」

---

## 3. 2025-2026年のホットなテーマ

### 3.1 AI/ML on Kubernetes（最大トレンド）

- KubernetesがAIの「OS」として確立（CNCF調査：本番利用82%）
- LLMOps、GPU管理（Kueue/Karpenter）、KServe（CNCF Incubating入り）
- CNCF Kubernetes AI Conformanceプログラム発表
- AIエージェントの運用・Observabilityが新たなテーマとして浮上
- CNDW2025でも複数セッション採択：LLM Observability、プロンプトバージョン管理、AI推論基盤など

### 3.2 Platform Engineering

- 企業の55%が採用、IDP（Internal Developer Platform）がデファクト化
- Backstage（3,400組織採用）、Crossplaneが主要ツール
- 「AI向けプラットフォーム」と「AIを活用したプラットフォーム」の二軸が注目
- ゴールデンパス・セルフサービス基盤の設計パターンが成熟

### 3.3 OpenTelemetry / Observability

- CNCFで2番目に活発なプロジェクト（貢献者1,884名）
- **eBPFベースのゼロコード自動計装**（OBI: OpenTelemetry-Based Instrumentation）が登場
- AI駆動のインシデント分析・根本原因特定が新潮流
- CNDW2025でも「100クラスター規模のOTel Collector」「OTel meets Wasm」など複数採択

### 3.4 eBPF / Cilium

- ネットワーク・セキュリティ・可観測性をカーネルレベルで統合
- Cilium v1.19でStrict Encryption Mode追加
- AKS/EKS/OpenShiftが公式サポート
- Service Mesh（kube-proxy置換）としての利用拡大

### 3.5 サイドカーレス Service Mesh

- Istio Ambient Mode GA（ztunnel + Waypoint Proxy）
- サービスメッシュ採用率が50%→42%に低下（複雑さ離れ）
- サイドカーレスモデルが「次世代メッシュ」として期待

### 3.6 ソフトウェアサプライチェーンセキュリティ

- SLSA 1.0 / Sigstore / SBOM の標準化完了
- Policy as Code（Kyverno/OPA）の普及
- DevSecOpsパターンの実践事例が増加

### 3.7 WebAssembly（Wasm）

- WASI 0.2安定、0.3（並行性対応）が2026年初頭予定
- エッジAI推論やサーバーサイドでの本格利用
- Envoyプラグインなどプロキシ拡張での活用

---

## 4. 下降傾向のテーマ

| テーマ | 理由 |
|--------|------|
| 従来型サイドカーメッシュ | Ambient Mode / eBPFに移行中 |
| 手動インストルメンテーション | OTel OBI（ゼロコード計装）が登場 |
| 従来型仮想化（VMware中心） | KubeVirtへの移行需要増 |
| Cluster Autoscaler | Karpenterに置き換え |

---

## 5. 業界・ドメインの多様化

CNDW2025では従来のWeb/SaaS企業に加え、多様な業界からのセッションが採択されている。

| 業界 | セッション例 |
|------|-------------|
| 自動車 | CloudNativeな車を作る（Toyota/KINTO） |
| 宇宙 | Progressive Deliveryで支える衛星コンステレーション |
| ゲーム | ゼルダの伝説の開発を支えたクラウド環境（任天堂） |
| 医療 | 病院向け搬送ロボットの多台数統括システム |
| 放送 | ABEMAのCM配信を支えるスケーラブルな分散カウンタ |
| 金融 | 勘定系システムのクラウド化 |
| 軍事 | 米軍Platform One/Black Pearlに学ぶDevSecOps |

---

## 6. CFP（プロポーザル）ガイドラインと採択のコツ

### 選考プロセス

1. 実行委員会による投票
2. X（Twitter）での反響を参考に絞り込み
3. 全体のバランス・多様性を考慮したディスカッションにより最終決定

### タイトルの書き方

- 具体的な成果・挑戦を示す（「〇〇入門」より「〇〇で△△を実現した話」）
- ラノベ風に「内容が一目でわかる」タイトルが好まれる
- 過度に長くしない（主旨が埋もれる）

### アブストラクト（概要）の書き方

- **対象読者を明記**: 「Kubernetesの基礎知識がある人向け」「アーキテクト・SREを想定」など
- **得られる知識・学びを具体的に記載**: 技術知識、組織的知見、マインドセットの変化
- **任意でアジェンダを箇条書きで示す**: セッション構成が見えると採択率が上がる

### 採択されやすい内容の方向性

- **本番環境での実践事例が最強**: 実験的・PoCより「本番で動いている」話が好まれる
- **中級者向けが採択率が高い**: 初級・上級より中級向けのプロポーザルが多く採択されている
- **失敗・苦労・試行錯誤を含める**: 「うまくいった話だけ」より「失敗からの学び」が共感を呼ぶ
- **カンファレンスのテーマに沿う**: 各回のテーマと関連付ける

### 実践的なコツ

- 締切まで何度でも更新可能なので、SNSの反響を見ながら磨くことができる
- 初登壇でも歓迎。実行委員会が全力でサポートする文化がある
- 複数トラックへの応募は可能だが、採択は1登壇者につき1セッションまで

### 禁止事項

- 商業的なプロモーションが主目的のセッション
- 特定技術・製品を一方的に批判・貶める内容

---

## 7. CNK2026 の3トラック別おすすめテーマ方向性

### CloudNative Days トラック（5月14日）

- AI/ML on Kubernetes（GPU管理、LLM推論基盤、KServe/vLLM）
- eBPF/Ciliumを活用したネットワーク・セキュリティ
- WebAssembly（サーバーサイド、エッジ）
- コンテナサプライチェーンセキュリティ
- マルチクラスター管理・運用の成熟

### Platform Engineering Kaigi トラック（5月15日）

- Backstage/IDP設計と運用の実践
- ゴールデンパス・セルフサービス基盤
- AI統合プラットフォーム（AI for Platform / Platform for AI）
- 開発者体験（DX）の定量評価と改善

### SRE Kaigi トラック（5月15日）

- OpenTelemetry OBI（ゼロコード自動計装）
- AI駆動のObservability・インシデント自動分析
- FinOps（クラウドコスト最適化）
- SLO/SLIの設計と組織浸透

---

## 8. 日本のクラウドネイティブコミュニティの現在地

KubeCon Japan 2025（東京、2025年6月・約1,500名参加・初の日本開催）を経て、日本のクラウドネイティブコミュニティは以下の段階に到達している。

1. **Kubernetesの「採用」から「成熟・最適化」へ**: マルチクラスター管理、コスト最適化（FinOps）、EoLアップグレード戦略が主流テーマに
2. **AI時代のインフラ再設計**: LLMのデプロイ基盤、GPU管理、LLMOpsがクラウドネイティブの文脈で語られるように
3. **Platform Engineeringの定着**: 開発者体験（DX）向上、セルフサービス基盤の構築がSRE・インフラエンジニアの責務として認識
4. **日本発のOSS貢献の増加**: Line Yahoo（Vald）、Google Japan（Kubernetes History Inspector）など日本企業の国際貢献が増加
5. **多様な産業へのKubernetes浸透**: ゲーム、製造、医療、交通、放送、金融など「テック企業以外」の採用事例が増加

---

## 参考リンク

- [プロポーザル一覧 | CloudNative Days Winter 2025](https://event.cloudnativedays.jp/cndw2025/proposals)
- [トーク一覧 | CloudNative Days Winter 2025](https://event.cloudnativedays.jp/cndw2025/talks)
- [プロポーザル一覧 | CloudNative Days Summer 2025](https://event.cloudnativedays.jp/cnds2025/proposals)
- [クラウドネイティブ会議 公式サイト](https://kaigi.cloudnativedays.jp/)
- [プロポーザル募集 | クラウドネイティブ会議 CFP](https://kaigi.cloudnativedays.jp/cfp/)
- [プロポーザルのコツ（CNDW2025 CFP）](https://cloudnativedays.jp/posts/cndw2025-cfp-advice-title-abst)
- [過去のセッション実績を振り返ってみた（CNDW2024）](https://cloudnativedays.jp/posts/cndw2024-proposal)
- [CFPの補足と注意点（CNDS2025）](https://cloudnativedays.jp/posts/cnds2025-cfp)
