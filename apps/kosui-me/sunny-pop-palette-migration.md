# Sunny Pop パレット移行計画

kosui-me のカラーパレットを現行の terracotta 暖色系から **Sunny Pop** パレットに刷新する移行計画。
Astro 移行と同時に適用することを想定。

---

## 1. パレット概要

### コンセプト

- アクセントカラー `#e05e52` を軸にした、明るく活発な印象のパレット
- ゴールデン系のセカンダリカラーで暖かさを追加
- ダークネイビー系のニュートラルで視認性を確保

---

## 2. カラートークン一覧

### Primary (Accent)

| トークン名 | 現行値 | 新値 | 用途 |
|-----------|--------|------|------|
| `--color-terracotta` | `#a5524c` | `#e05e52` | メインアクセント、リンク色、アクティブナビ背景 |
| `--color-terracotta-dark` | `#7d3d38` | `#c04a40` | ホバー状態 |
| `--color-terracotta-light` | `#e09890` | `#f0887e` | ダークモードリンク色 |
| `--color-rust` | `#6b302c` | `#a03830` | 強調テキスト |

### Secondary (Golden) — 新規

| トークン名 | 値 | 用途 |
|-----------|-----|------|
| `--color-golden` | `#F2A93B` | アクセント装飾、ホバーハイライト |
| `--color-golden-light` | `#FFF0D1` | バッジ背景、ソフトハイライト |

### Neutrals

| トークン名 | 現行値 | 新値 | 用途 |
|-----------|--------|------|------|
| `--color-charcoal` | `#48423e` | `#1A1A2E` | 本文テキスト（ダークネイビー） |
| `--color-charcoal-light` | `#6b6460` | `#4A4860` | サブテキスト |
| `--color-cream` | `#faf8f5` | `#FFFDF7` | カード背景（ライト） |
| `--color-clay-bg` | `#f2efeb` | `#FFF8ED` | ページ背景（ゴールデンティント） |
| `--color-warm-gray` | `#e0dcd6` | `#F2D9A0` | ボーダー、装飾線 |
| `--color-warm-gray-dark` | `#ccc7c0` | `#D4B87A` | 強調ボーダー |
| `--color-sand-light` | `#ede5da` | `#FFF0D1` | タグ背景 |
| `--color-warm-white` | `#fdf9f6` | `#FFFDF7` | 最も明るい背景 |

### Split-complementary (既存・変更なし)

| トークン名 | 値 | 用途 |
|-----------|-----|------|
| `--color-teal` | `#5a8e80` | 装飾アクセント |
| `--color-steel-blue` | `#5570b0` | 装飾アクセント |

---

## 3. ダークモード

### ベース色

| 要素 | 現行値 | 新値 |
|------|--------|------|
| `body` 背景 | `#1a1918` | `#1A1820` |
| `body` テキスト | `warm-gray` (CSS変数) | `#F5EFE0` |
| カード背景 | `#2d2a28` | `#2A2630` |
| タグ背景 | `#3d3835` | `#3A3540` |

### ダークモードのハードコード色一覧

以下は `dark:bg-[#...]` / `dark:text-[#...]` 形式でハードコードされている箇所。
Astro 移行時に CSS 変数化を推奨。

| ファイル | 現行値 | 新値 |
|---------|--------|------|
| `src/index.css` body | `dark:bg-[#1a1918]` | `dark:bg-[#1A1820]` |
| `src/pages/PostListPage.tsx` カード | `dark:bg-[#2d2a28]` | `dark:bg-[#2A2630]` |
| `src/pages/PostListPage.tsx` タグ | `dark:bg-[#3d3835]` | `dark:bg-[#3A3540]` |
| `src/pages/TalkListPage.tsx` カード | `dark:bg-[#2d2a28]` | `dark:bg-[#2A2630]` |
| `src/pages/TalkListPage.tsx` タグ | `dark:bg-[#3d3835]` | `dark:bg-[#3A3540]` |
| `src/pages/HomePage.tsx` カード | `dark:bg-[#2d2a28]` | `dark:bg-[#2A2630]` |
| `src/pages/HomePage.tsx` タグ | `dark:bg-[#3d3835]` | `dark:bg-[#3A3540]` |

> Astro 移行時に `--color-dark-card` / `--color-dark-tag` などの CSS 変数を追加し、
> ハードコード値を排除することを推奨。

---

## 4. Shadow トークン（変更なし）

Clay shadow は現行のまま流用。

```css
--shadow-clay: /* 現行値をそのまま使用 */
--shadow-clay-hover: /* 現行値をそのまま使用 */
--shadow-clay-dark: /* 現行値をそのまま使用 */
--shadow-clay-dark-hover: /* 現行値をそのまま使用 */
--radius-clay: 16px; /* 変更なし */
```

---

## 5. レイアウト変更（ヘッダー・フッター）

### ヘッダー

| 項目 | 現行 | 新 |
|------|------|-----|
| ロゴ | テキストリンク "kosui" | 丸型画像 (30x30, `icon.kosui.me`) + "kosui" テキスト (font-bold) |
| ナビスタイル | テキストリンク横並び | ピル型セグメントコントロール |
| アクティブ状態 | なし | `bg-terracotta text-white font-semibold rounded-full` |
| 非アクティブ | `text-charcoal-light` | `text-charcoal/55 dark:text-[#B0A890]` |
| ボーダー | `border-b border-warm-gray` | なし |

#### ナビアイテム

| パス | ラベル | アクティブ判定 |
|------|--------|--------------|
| `/` | Posts | `pathname === '/'` |
| `/talks` | Talks | `pathname.startsWith('/talks')` |
| `/about` | About | `pathname.startsWith('/about')` |
| `/feed.xml` | RSS | 常に非アクティブ（外部リンク） |

### フッター

- `border-t` を削除（ボーダーレス化）

---

## 6. 新しい index.css（参考実装）

```css
@import "tailwindcss";

@theme {
  /* Primary (Accent) */
  --color-terracotta:       #e05e52;
  --color-terracotta-dark:  #c04a40;
  --color-terracotta-light: #f0887e;
  --color-rust:             #a03830;

  /* Secondary (Golden) */
  --color-golden:           #F2A93B;
  --color-golden-light:     #FFF0D1;

  /* Neutrals */
  --color-charcoal:         #1A1A2E;
  --color-charcoal-light:   #4A4860;
  --color-cream:            #FFFDF7;
  --color-clay-bg:          #FFF8ED;
  --color-warm-gray:        #F2D9A0;
  --color-warm-gray-dark:   #D4B87A;
  --color-sand-light:       #FFF0D1;
  --color-warm-white:       #FFFDF7;

  /* Split-complementary accents */
  --color-teal:       #5a8e80;
  --color-steel-blue: #5570b0;

  /* Clay card shadows (変更なし) */
  --shadow-clay: ...;
  --shadow-clay-hover: ...;
  --shadow-clay-dark: ...;
  --shadow-clay-dark-hover: ...;
  --radius-clay: 16px;
}

body {
  @apply bg-clay-bg text-charcoal antialiased dark:bg-[#1A1820] dark:text-[#F5EFE0];
  font-feature-settings: "palt";
}
```

---

## 7. 視覚的な色比較

`sunny-pop-palette-migration.html` を参照。
ブラウザで開くと、現行パレットと新パレットの色見本を並べて確認できる。
