---
theme: ../../themes/kosui-me
title: "本当にclassを使わずにシステムを運用できるの？"
info: |
  TSKaigi 2026
author: 岩佐 幸翠
keywords: TypeScript, ECMAScript, class, 構造的部分型, 型消去
transition: slide-left
duration: 30min
mdc: true

talk:
  date: "2026-06-24"
  event: "TSKaigi 2026 事後勉強会"
  description: 実際の運用中のシステムを紹介
  themes:
    - typescript
  duration: "30min"
  speaker: "岩佐 幸翠"
---

<div class="text-sm opacity-80 mb-16">TSKaigi 2026 事後勉強会</div>

# 本当にclassを使わずにシステムを運用できるの？

<div class="mt-16">
  <div class="text-lg">2026年6月24日</div>
  <div class="text-lg">kosui (岩佐 幸翠)</div>
</div>

---
layout: center
class: text-center
---

# class、使ってますか

---

# クイズ

## classを使っているあなたなら正解できる！

<div class="grid grid-cols-4 gap-3 mt-4 items-start">

<div class="col-span-2">

```typescript
class Rectangle {
  constructor(
    public width: number,
    public height: number,
  ) {}
}

const r1 = new Rectangle(1, 2);
const r2 = { width: 3, height: 4 };

const isRectangle =
  (r: Rectangle): boolean =>
    r instanceof Rectangle;

isRectangle(r1);
isRectangle(r2);
```


</div>

<div class="col-span-2">

Q. `r1` はRectangle classのインスタンスだが  
`r2` はあくまでコンストラクタを経由しない

`r2` を `isRectangle` の引数に与えると...

- A) 型検査を通らない
- B) 型検査は通り、実行時エラー
- C) 型検査は通り、 `true` を返す
- D) 型検査は通り、 `false` を返す


</div>

</div>

---

# クイズ

## 正解発表

<div class="grid grid-cols-4 gap-3 mt-4 items-start">

<div class="col-span-2">

```typescript
class Rectangle {
  constructor(
    public width: number,
    public height: number,
  ) {}
}

const r1 = new Rectangle(1, 2);
const r2 = { width: 3, height: 4 };

const isRectangle =
  (r: Rectangle): boolean =>
    r instanceof Rectangle;

isRectangle(r1);
isRectangle(r2);
```


</div>

<div class="col-span-2">

Q. `r1` はRectangle classのインスタンスだが  
`r2` はあくまでコンストラクタを経由しない

`r2` を `isRectangle` の引数に与えると...

- <span class="text-gray">A) 型検査を通らない</span>
- <span class="text-gray">B) 型検査は通り、実行時エラー</span>
- <span class="text-gray">C) 型検査は通り、 `true` を返す</span>
- <span class="text-red">D) 型検査は通り、 `false` を返す 💯</span>

</div>

</div>

---

# TSKaigi 2026のおさらい

### TypeScriptのclassの歴史

ES4で導入されるはずだったclassを  
TSが先駆けて実装したのち、ES2015が3年遅れで実装した

TypeScript が class を先行実装したことで、ECMAScript との仕様の差異が生じた

### TypeScriptのclassでつまづくポイント

- 構造的部分型だから  
  classのインスタンス以外も型検査時は通る
- 型消去によって型検査時の情報は実行時にアクセスできない
- プロトタイプベース言語の上に構築されたsyntax sugarだから  
  `this` の指す先がインスタンスとは限らない

詳しくは本編をみてね！

---

# 私の主張

TypeScriptのclassを使わない世界もあるよ

以下を組み合わせて、全てを値として表現することで、classを使わずにシステムを運用できる

- Branded Type
- Discriminated Union
- Companion Object Pattern

### しかし...

大規模なプロジェクトで本当にclassを使わずに運用できるのか？

そしてその設計は手間に見合った価値をもたらすのか？

---

# 実例

## カケハシで運用されている認証基盤 (IdP)

- 医療システムで求められる高い可用性とセキュリティ
- 厚労省のガイドラインに準拠
- 5つ以上のプロダクトが接続するOpenID Connect Provider
- TypeScriptで構築されている
- アプリケーションコード上は**classを利用していない**

---

# 方針

### 外側

全ての境界でスキーマライブラリが必ず検証する

### 内側

スキーマライブラリが実行時と型検査時の双方で検証するため、  
スキーマライブラリの型をそのまま使用できる

あらゆるエンティティは単なる値として表現され  
その振る舞いはメソッドではなく単なる関数で表現する

---

# 外側から内側へ



---

# ドメインモデルの世界

- UserId, ClientId  
  Branded Typeで表現する
- ログインセッションやトークンの検証状態  
  Discriminated Unionで表現する
- UserやClientなどのエンティティ  
  kind付きの単なるオブジェクトとして表現する

