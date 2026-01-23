---
theme: ./
layout: cover
---

<div class="text-sm opacity-80 mb-16">プロダクト開発×生成AI活用の舞台裏LT会</div>

# サンプルプレゼンテーション<br>KKHSテーマのご紹介

<div class="mt-16">
  <div class="text-lg">2026年1月23日</div>
  <div class="text-lg">山田 太郎</div>
</div>

<div class="absolute bottom-6 left-14 text-xs opacity-60">©Example Inc.</div>

---
layout: section
---

# テーマの特徴

論理的で健全な印象を与えるデザイン

---

# テーマの特徴

このテーマは `#1e74bb` を基調とした、信頼性と論理性を表現するデザインです。

- **プライマリカラー** - 落ち着いた青色で信頼感を演出
- **ダークモード対応** - ライト/ダーク両方に最適化
- **日本語フォント** - Noto Sans JP / Noto Serif JP
- **コードハイライト** - Fira Code による見やすいコード表示
- **ユーティリティクラス** - カード、バッジなどのコンポーネント

<br>

> 論理的で健全な印象を与えるデザインを目指しています

---

# タイポグラフィ

## 見出し2のスタイル

### 見出し3のスタイル

本文テキストは読みやすさを重視し、適切な行間と文字色を設定しています。
**強調テキスト**や*イタリック*も自然に表示されます。

`インラインコード`はプライマリカラーでハイライトされます。

---

# リストスタイル

## 順序なしリスト

- 第一の項目
- 第二の項目
  - ネストされた項目
  - もう一つのネスト
- 第三の項目

## 順序付きリスト

1. ステップ1: 計画を立てる
2. ステップ2: 実装する
3. ステップ3: テストする

---

# テーブル

| 機能 | 説明 | 対応状況 |
| --- | --- | --- |
| ダークモード | ライト/ダーク切り替え | 対応済み |
| 日本語フォント | Noto Sans JP | 対応済み |
| コードハイライト | Shiki | 対応済み |
| カスタムレイアウト | cover, intro | 対応済み |

---

# コードブロック

```typescript
// 型安全なユーザー管理
interface User {
  id: string;
  name: string;
  email: string;
}

const createUser = (name: string, email: string): User => ({
  id: crypto.randomUUID(),
  name,
  email,
});

const user = createUser('山田太郎', 'taro@example.com');
console.log(user);
```

---

# ユーティリティクラス

<div class="grid grid-cols-2 gap-4">
  <div class="card">
    <h3>カードコンポーネント</h3>
    <p>`.card` クラスで囲むことで、影付きのカードUIを作成できます。</p>
  </div>
  <div class="card">
    <h3>バッジ</h3>
    <p>
      <span class="badge">Primary</span>
      <span class="badge-outline ml-2">Outline</span>
    </p>
  </div>
</div>

<div class="mt-8">
  <p><span class="highlight">ハイライト</span>クラスでテキストを強調できます。</p>
</div>

---

# 設計を育てる3つの観点

<MessageBox>

設計パターンは「選んで終わり」ではない
運用しながらチームで育て続ける

</MessageBox>

<CardGrid :cols="3">
  <NumberCard
    :number="1"
    title="なぜ選んだか"
    description="解決したい課題と
受け入れるトレードオフを
チームで言語化"
  />
  <NumberCard
    :number="2"
    title="どう運用するか"
    description="導入して終わりではなく
監視・障害対応・改善の
サイクルを回す"
  />
  <NumberCard
    :number="3"
    title="どう育てるか"
    description="運用で見つかった課題を
設計にフィードバックし
継続的に改善"
  />
</CardGrid>

---
layout: center
class: "text-center"
---

# ご清聴ありがとうございました

<div class="mt-8">
  <span class="badge">KKHS Theme</span>
</div>
