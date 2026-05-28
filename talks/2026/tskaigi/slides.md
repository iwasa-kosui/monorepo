---
theme: ../../themes/kosui-me
title: "TypeScriptのclassはなぜこうなったのか"
info: |
  TSKaigi 2026 登壇資料
  歴史・落とし穴・そして使いどころを探る30分
author: 岩佐 幸翠
keywords: TypeScript, ECMAScript, class, 構造的部分型, 型消去
transition: slide-left
duration: 30min
mdc: true

talk:
  date: "2026-05-22"
  event: "TSKaigi 2026"
  description: |
    TypeScriptのclassが今の形になった歴史を紐解き、落とし穴を根本原因から整理し、対策を提示します。
  themes:
    - typescript
  duration: "30min"
  speaker: "岩佐 幸翠"
---

<div class="text-sm opacity-80 mb-16">TSKaigi 2026</div>

# TypeScriptのclassは<br/>なぜこうなったのか

歴史・落とし穴・そして対策を探る30分

<div class="mt-16">
  <div class="text-lg">2026年5月22日</div>
  <div class="text-lg">岩佐 幸翠</div>
</div>

---

# 自己紹介

<div class="grid grid-cols-3 gap-8">
<div class="col-span-2">

## 岩佐 幸翠（いわさ こうすい）

- 株式会社カケハシ（2022〜）
- 認証権限基盤チーム テックリード

<div class="mt-2 text-sm">

登壇歴: TSKaigi 2024 / 関数型まつり 2025 / SRE Kaigi 2026

</div>

<div class="mt-2 text-sm opacity-70">

X: @kosui_me

</div>

</div>
<div>

<img src="https://icon.kosui.me/" class="w-48 rounded-none bg-transparent shadow-none! mix-blend-multiply" alt="kosuiのアイコン" />

</div>
</div>

---

# 本日のテーマ

<MessageBox>

TypeScript の class を <u>よく知った上で</u><br/>改めて付き合い方を考える

</MessageBox>

<div class="mt-10">

- **歴史**  
  なぜ今の挙動になっているのか
- **落とし穴**  
  なぜ私たちはこの挙動に戸惑うのか
- **対策**  
  その先にある、これからの付き合い方

</div>

---

# 挙動を体験しよう

<div class="mt-30 text-center opacity-90">
<div class="text-3xl">

これから3つのクイズを出題します

</div>
<div class="text-2xl">

全問正解できるかな？

</div>
</div>

---

# Q1. このコード、トランスパイルは通る？

<div class="grid grid-cols-2 gap-8 mt-4 items-start">

<div>

```typescript
class User { name = "" }
class Product { name = "" }

const greet = (u: User) =>
  `Hello, ${u.name}`;

console.log(greet(new Product()));
```

</div>

<div class="text-base">

- **A.** トランスパイル時に型エラー
- **B.** トランスパイルも実行も通る
- **C.** 実行時に TypeError

</div>

</div>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

---

# Q1の答え: B. トランスパイルも実行も通る

<div class="grid grid-cols-2 gap-8 mt-4">

<div>

```typescript
class User { name = "" }
class Product { name = "" }

const greet = (u: User) =>
  `Hello, ${u.name}`;

console.log(greet(new Product()));
```

</div>

<div>

### トランスパイル

通過する

### 実行時

```text
Hello, 
```

</div>

</div>

<MessageBox>

User クラスを引数にとる関数に  
Productを代入してもトランスパイルも実行もできる

</MessageBox>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

---

# Q2. このコード、実行すると何が起きる？

<div class="grid grid-cols-2 gap-8 mt-4 items-start">

<div>

```typescript
class Uploader {
  storage = "/tmp";
  upload() {
    console.log(this.storage);
  }
}

const fn = new Uploader().upload;
fn();
```

</div>

<div class="text-base">

- **A.** 正常に出力される
- **B.** undefined と表示される
- **C.** TypeError で実行時エラー

</div>

</div>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

---

# Q2の答え: C. TypeError で実行時エラー

<div class="grid grid-cols-2 gap-8 mt-4">

<div>

```typescript
class Uploader {
  storage = "/tmp";
  upload() {
    console.log(this.storage);
  }
}

const fn = new Uploader().upload;
fn();
```

</div>

<div>

### トランスパイル

通過する

### 実行時

```text
TypeError: Cannot read
  properties of undefined
  (reading 'storage')
```

</div>

</div>

<MessageBox>

メソッドを変数に代入して呼び出すと  
this が undefined になる

</MessageBox>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

---

# Q3. このコード、`"setter!"` は表示される？

<div class="grid grid-cols-2 gap-8 mt-4 items-start">

<div>

```typescript
class Base {
  set x(v: number) {
    console.log("setter!", v);
  }
}

class Sub extends Base {
  x = 42;
}

new Sub();
```

</div>

<div class="text-base">

- **A.** 親の setter が呼ばれる
- **B.** 親の setter は呼ばれない
- **C.** ビルド設定で挙動が変わる

</div>

</div>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

---

# Q3の答え: C. ビルド設定で挙動が変わる

<div class="grid grid-cols-2 gap-8 mt-4">

<div>

```typescript
class Base {
  set x(v: number) {
    console.log("setter!", v);
  }
}

class Sub extends Base {
  x = 42;
}

new Sub();
```

</div>

<div>

### トランスパイル

通過する

### 実行時

useDefineForClassFieldsが...

- falseの場合: `setter! 42`
- trueの場合: 出力なし

</div>

</div>

<MessageBox>

同じコードでも tsconfig の<br/>`useDefineForClassFields` で挙動が変わる<br/>（このフラグの意味は本編で解説します）

</MessageBox>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

---

# 問い

<MessageBox>

TypeScript の class は<br/>なぜこのような挙動になっているのか

</MessageBox>

<div class="mt-10">

- この挙動を採用した設計の背景と意図は何か
- そして、私たちはこの class とどう付き合っていけばいいのか

</div>

---

# 本日の構成

1. **歴史**  
  なぜ今の挙動になっているのか
2. **特性と対策**  
  3つの特性と、それが生む落とし穴・対策をセットで
3. **クラスがない世界**  
  トランスパイル時にも実行時にも参照できる値で全てを表現する
4. **class を使う**  
  Custom Error や `Symbol.dispose` など class が自然な場面
5. **まとめ**  
  立場ごとの、これからの付き合い方

---
layout: section
---

# 1. 歴史

TypeScriptとECMAScriptのclass

---

# なぜ歴史を知る必要があるのか

### TypeScript と ECMAScript

TypeScript が **ES2015 より3年先に** class を実装した

- 2012年: TypeScript 0.8 が class をサポート
- 2015年: ES2015 が class をサポート

### 統合の歴史

後からECMAScriptの仕様が決まり、両者を統合する長い歴史が始まった

この歴史を知ることで、今の仕様の背景が見えてくる

---

# ES4 の挫折 と ES2015 の最小設計

### 2008: ES4 廃棄

- class・強い型付けを含む ES4 を Microsoft 等が反対、2008 年に廃棄
- 直後に CoffeeScript など class を持つ AltJS が広がる

### 2015: maximally minimal classes

- ES4 の反省から、TC39 全員が合意できる最小限の class を ES2015 に
- private / static fields / decorators はすべて後回し
- 中身は**プロトタイプに基づいて構築**された構文

<MessageBox>

最小限で始めて後から積む設計が<br/>後の TypeScript と ECMAScript の整合作業の原因になった

</MessageBox>

---

# TypeScript誕生とclassの先行実装 (2012)

- ES2015 より3年先に class をサポート
- ES2015 と同様にベースはあくまでプロトタイプ
- アクセス修飾子 (private/protected/public) はあるがトランスパイル時に消去される

<div class="grid grid-cols-2 gap-6 mt-4 items-start">

<div>

### トランスパイル前 (TypeScript 0.8)

```typescript
class Greeter {
  private name: string;
  constructor(name: string) {
    this.name = name;
  }
  greet() {
    return `Hello, ${this.name}`;
  }
}
```

</div>

<div>

### トランスパイル後 (ES5)

```javascript
var Greeter = (function () {
  function Greeter(name) {
    this.name = name;
  }
  Greeter.prototype.greet = function () {
    return "Hello, " + this.name;
  };
  return Greeter;
})();
```

</div>

</div>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

---

# TSの先行実装とECMAScriptの仕様差異

TypeScript が class を先行実装したことで、ECMAScript との仕様の差異が生じた

### 例) setter の振る舞い

子classから親classのsetterを呼び出すか否か

```typescript
class Base {
  set x(v: number) {
    console.log("setter!", v);
  }
}

class Sub extends Base {
  // 親classのsetterを呼び出すべきか
  x = 42;
}
```

---

# 2種類のsetter: `[[Define]]` vs `[[Set]]`

<div class="grid grid-cols-2 gap-6 mt-4">

<div>

### `[[Set]]` (TypeScript 先行実装)

代入として展開 → `setter! 42` 出力

```typescript
// Sub の constructor 内
this.x = 42;
```

</div>

<div>

### `[[Define]]`（ES2022 標準）

`defineProperty` として展開 → setter バイパス

```typescript
// Sub の constructor 内
Object.defineProperty(this, "x", {
  value: 42, writable: true,
  enumerable: true, configurable: true,
});
```

</div>

</div>

<div class="mt-4 text-xs opacity-60">

https://github.com/tc39/proposal-class-fields

</div>

---
layout: section
---

# 仕様差異の吸収

TypeScript 先行実装では `[[Set]]` を採用したが  
ES2022では `[[Define]]` を採用している

その差分を吸収するために  
TypeScript 3.7 で `useDefineForClassFields` を導入

- `target: ES2022` 以上なら既定 `true`（`[[Define]]`）
- それ以外は既定 `false` (`[[Set]]`)

targetの違いによってデフォルトが変わってしまう (つらい)


---
layout: center
class: text-center
---

# 歴史編まとめ

<MessageBox>

classの複雑さは<br/>ECMAScript との長期にわたる整合作業の歴史的産物

</MessageBox>

---
layout: section
---

# 2. 特性と対策

3つの特性と、それぞれが生む落とし穴・対策

---
layout: center
class: text-center
---

# 3つの特性

<div class="mt-12 grid grid-cols-3 gap-6 items-stretch">
  <div class="py-6 px-4 rounded-lg" style="background-color: var(--theme-accent-bg);">
    <div class="text-2xl font-bold mb-2">構造的部分型</div>
    <div class="text-sm">型の互換性は<br/>名前ではなく構造で決まる</div>
  </div>
  <div class="py-6 px-4 rounded-lg opacity-30">
    <div class="text-2xl mb-2">型消去</div>
    <div class="text-sm">TypeScript の型情報は<br/>実行時に消える</div>
  </div>
  <div class="py-6 px-4 rounded-lg opacity-30">
    <div class="text-2xl mb-2">プロトタイプベース</div>
    <div class="text-sm">class は prototype に基づいて<br/>構築されている</div>
  </div>
</div>

---

# 特性1: 構造的部分型

## 部分型とは

<div>

### 名前的部分型: Java / C# / Rust

- 型名と明示的に宣言された継承で互換性が決まる
- 同じ構造でも別名のクラスは別物とみなす

</div>

<div>

### 構造的部分型: TypeScript

- 持っているプロパティと関数で互換性が決まる
- 同じ構造なら同じものとみなす

</div>

---

# 構造的部分型の便利さ

```typescript
type Logger = {
  log: (msg: string) => void
}
const run = (logger: Logger) => logger.log("running");

// 本番環境: console をそのまま渡す
run(console);

// テスト: 必要なメソッドだけ持つテストダブルに差し替えられる
const logs: string[] = [];
run({ log: (m) => logs.push(m) });
```

- `implements` 宣言もモックライブラリも**不要**
- 必要な形さえ持てば、組み込み・自前・テストダブル何でも通せる

---

# 落とし穴: User と Product を区別できない

<div class="grid grid-cols-2 gap-6 mt-4 items-start">

<div>

```typescript
class User { name = "" }
class Product { name = "" }

const greet = (u: User) =>
  `Hello, ${u.name}`;

console.log(greet(new Product()));
// ↑ エラーなし!
```

</div>

<div>

- `User` と `Product` はクラス名が違うだけでプロパティ構成が同じ
- TypeScript は構造で互換を判断するため、Product を User として渡しても通る

</div>

</div>

<style>
code {
  font-size: 12px;
  line-height: 14px;
}
</style>

---

# 対策: Branded Type で名前を値に埋め込む

```typescript
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

type UserId    = Brand<string, "UserId">;
type ProductId = Brand<string, "ProductId">;
```

- 文字列タグでブランドを付与し、構造が同じでも**型レベルで区別**
- `unique symbol` を使うのでランタイムコストはゼロ

---

# Branded Type で構造が同じ型を弾ける

```typescript
type User    = { id: UserId;    name: string };
type Product = { id: ProductId; name: string };

const greet = (u: User) => `Hello, ${u.name}`;

declare const p: Product;
greet(p); // 型エラー
```

- `User` と `Product` は構造的部分型では同じだが、ブランドが違えば別物
- class のフィールド型に使えば NestJS / TypeORM の Entity でも有効

---
layout: center
class: text-center
---

# 3つの特性

<div class="mt-12 grid grid-cols-3 gap-6 items-stretch">
  <div class="py-6 px-4 rounded-lg opacity-30">
    <div class="text-2xl mb-2">構造的部分型</div>
    <div class="text-sm">型の互換性は<br/>名前ではなく構造で決まる</div>
  </div>
  <div class="py-6 px-4 rounded-lg" style="background-color: var(--theme-accent-bg);">
    <div class="text-2xl font-bold mb-2">型消去</div>
    <div class="text-sm">TypeScript の型情報は<br/>実行時に消える</div>
  </div>
  <div class="py-6 px-4 rounded-lg opacity-30">
    <div class="text-2xl mb-2">プロトタイプベース</div>
    <div class="text-sm">class は prototype に基づいて<br/>構築されている</div>
  </div>
</div>

---

# 特性2: 型消去

<MessageBox>

TypeScript の型情報は<br/>**トランスパイル時にすべて削除される**

</MessageBox>

<div class="mt-8 grid grid-cols-2 gap-8 text-base">

<div>

### TypeScript のソース

- `interface` / `type` 等の型情報を含む
- トランスパイル時に検査され、出力には残らない

</div>

<div>

### トランスパイル後の JavaScript

- 型情報は何も残らない
- 実行時には値だけが存在する

</div>

</div>

---

# 落とし穴: 構造で通っても `instanceof` は通らない

<div class="grid grid-cols-5 mt-4 items-start">

<div class="col-span-3">

```typescript
class Rectangle {
  constructor(
    public width: number,
    public height: number,
  ) {}
}

const r1: Rectangle = new Rectangle(1, 2);
const r2: Rectangle = { width: 3, height: 4 };
// ↑ 構造的部分型で通る

const isRectangle = (r: Rectangle): boolean =>
  r instanceof Rectangle;

isRectangle(r1); // true
isRectangle(r2); // false  ← Rectangle 型なのに!
```

</div>

<div class="col-span-2">

- TS は構造的部分型で `r2` を `Rectangle` として受け入れる
- でも `instanceof` は  
  実行時のプロトタイプチェーンを  
  見るので、`new` していない r2 は false
- 結果として...  
  型検査では `Rectangle` 型なのに  
  `instanceof Rectangle` が false

</div>

</div>

<style>
code {
  font-size: 12px;
  line-height: 14px;
}
</style>

---

# 対策: Discriminated Union でタグを値に置く

<div class="grid grid-cols-2 gap-6 mt-4 items-start">

<div>

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };

const area = (s: Shape): number => {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.radius ** 2;
    case "square":
      return s.side ** 2;
    default: {
      // 網羅性検証
      const _: never = s;
      return _;
    }
  }
};
```

</div>

<div>

- `kind` は**実行時に残る値**  
  型消去の影響を受けない
- `never` の網羅性検証で  
  case の漏れがコンパイル時に弾ける
- class を作らずオブジェクトリテラルでも書ける

</div>

</div>

<style>
code {
  font-size: 12px;
  line-height: 14px;
}
</style>

---
layout: center
class: text-center
---

# 3つの特性

<div class="mt-12 grid grid-cols-3 gap-6 items-stretch">
  <div class="py-6 px-4 rounded-lg opacity-30">
    <div class="text-2xl mb-2">構造的部分型</div>
    <div class="text-sm">型の互換性は<br/>名前ではなく構造で決まる</div>
  </div>
  <div class="py-6 px-4 rounded-lg opacity-30">
    <div class="text-2xl mb-2">型消去</div>
    <div class="text-sm">TypeScript の型情報は<br/>実行時に消える</div>
  </div>
  <div class="py-6 px-4 rounded-lg" style="background-color: var(--theme-accent-bg);">
    <div class="text-2xl font-bold mb-2">プロトタイプベース</div>
    <div class="text-sm">class は prototype に基づいて<br/>構築されている</div>
  </div>
</div>

---

# 特性3: プロトタイプベース

<MessageBox>

class は **`prototype` に基づいて構築** されており<br/>`this` は呼び出し方で動的に決まる

</MessageBox>

<div class="mt-8 grid grid-cols-2 gap-8 text-base">

<div>

### Java / C#

- メソッドはインスタンスに束縛される
- `this` は常に同じオブジェクトを指す

</div>

<div>

### JavaScript / TypeScript

- メソッドは `prototype` 上の独立した関数
- `this` は呼び出し時のレシーバで決まる

</div>

</div>

---

# 落とし穴: this バインディングが切り離される

```typescript
class Uploader {
  private storage = "/tmp";
  upload(fileName: string) { console.log(`${fileName} → ${this.storage}`); }
}

const uploader = new Uploader();
[1].forEach(uploader.upload);  // TypeError: Cannot read properties of undefined
```

- JS では関数の**呼び出し方**で `this` が決まる
- `uploader.upload()` の形で呼ぶと `this = uploader`
- 関数を変数経由で呼ぶと `this = undefined`（インスタンスとの紐付けが切れる）
- class methods は `prototype` 上の関数値で、取り出した瞬間に独立した関数になる

---

# 対策: this を持たない関数で表現する

```typescript
// 対策a: class 内で対処。アロー関数フィールドで lexical this
class Uploader {
  upload = (fileName: string) => { console.log(`${fileName} → ${this.storage}`); };
}

// 対策b: class から離れて関数で扱う。そもそも this を作らない
type Uploader = Readonly<{ storage: string }>;
const upload = (u: Uploader) => (fileName: string) =>
  console.log(`${fileName} → ${u.storage}`);
```

- **a**: lexical this で固定して切り離しを防ぐ
- **b**: this を持たない関数で扱うため、切り離す対象自体が存在しない

---
layout: section
---

# 3. クラスがない世界

トランスパイル時にも実行時にも参照できる値で全てを表現する

---

# TypeScript には実行時の型情報がない

- 実行時に型のアイデンティティを問い合わせる手段がない
- リフレクションで型を辿る、`instanceof` で interface を判別する、といったことはできない
- 不便だと思いがち

---

# classではなく値で表現する

### 値で表現する3つの道具

| 失われたもの | 値で取り戻す |
|---|---|
| **同じ構造の区別** | **Branded Type** |
| 種別の判別 | **Discriminated Union** |
| 振る舞い | **関数**（this を持たない） |

ここまでの3つの対策はすべてこの組み合わせ

<MessageBox>

TypeScript では関数も値であるように、<u>すべてを値として表現できる</u>

</MessageBox>

---

# 関数のシグニチャが契約そのものになる

```typescript
const findUserById: (id: UserId) => Promise<User | null>
```

- **(入力型 → 出力型)** を読むだけで、何を渡せば何が返るかが決まる
- 実行時に型を問い合わせる手段がない代わりに、**シグニチャ1行で契約が完結**
- IDE 補完・型推論・grep だけで振る舞いを追える静的な契約

<MessageBox>

実行時の型情報がなくても、<br/>**シグニチャを読めば振る舞いが分かる**

</MessageBox>

---

# 値で組み立て、値でテストする

<div class="grid grid-cols-5 gap-6 mt-4 items-start">

<div class="col-span-3">

```typescript
const OrderId = z.uuid().brand<"OrderId">();
type OrderId = z.infer<typeof OrderId>;
type Order =
  | { kind: "draft";  id: OrderId }
  | { kind: "placed"; id: OrderId; placedAt: Date };

const place = (o: Order & { kind: "draft" }, now: Date): Order =>
  ({ kind: "placed", id: o.id, placedAt: now });

// テスト
const id = OrderId.parse(crypto.randomUUID());
expect(place({ kind: "draft", id }, new Date()).kind).toBe("placed");
```

</div>

<div class="col-span-2">

- **Discriminated Union**: 状態 (`Order`)
- **関数**: 状態遷移 (`place`)
- **Branded Type**: ID (`OrderId`)
- テスト: 値を渡すだけ、**`new` もモックも不要**

</div>

</div>

<MessageBox>

**3つの道具を使えば値だけで表現できる**

</MessageBox>

<style>
code {
  font-size: 12px;
  line-height: 14px;
}
</style>

---
layout: section
---

# 4. class を使う

class が自然に活きる場面

---

# Custom Error: `class extends Error`

```typescript
class ValidationError extends Error {
  constructor(message: string, public readonly field: string) {
    super(message);
    this.name = "ValidationError";
  }
}

try {
  /* ... */
} catch (e) {
  if (e instanceof ValidationError) {
    console.log(e.field);
  }
}
```

- `Error` を継承して `stack` / `cause` / `name` の機能を引き継ぐ
- `instanceof` でキャッチ判定する JavaScript の慣用句
- try/catch との統合を考えると Discriminated Union では代替しづらい

---

# リソース管理: `Symbol.dispose` と `using` (TS 5.2+)

<div class="grid grid-cols-5 gap-6 mt-4 items-start">

<div class="col-span-3">

```typescript
class FileHandle {
  constructor(private path: string) { /* open */ }
  read() { /* ... */ }
  [Symbol.dispose]() { /* close */ }
}

{
  using f = new FileHandle("/tmp/x");
  f.read();
}  // ブロック終了で [Symbol.dispose]() が自動実行
```

</div>

<div class="col-span-2">

- `[Symbol.dispose]()` を持つオブジェクトは `using` の対象
- DB 接続・WebSocket・ファイルハンドルなどに
- protocol だけなら object literal でも書ける

</div>

</div>

<style>
code {
  font-size: 12px;
  line-height: 14px;
}
</style>

---

# 同じ contract、class でも値でも書ける

```typescript
type Connection = { query: (sql: string) => Promise<unknown>; [Symbol.dispose]: () => void };
```

<div class="grid grid-cols-2 gap-6 mt-2 items-start">

<div>

```typescript
// class
class PgConnection implements Connection {
  constructor(private c: PgClient) {}
  query(sql: string) { return this.c.query(sql); }
  [Symbol.dispose]() { this.c.end(); }
}
```

</div>

<div>

```typescript
// object literal + factory
const createPgConnection = (c: PgClient): Connection => ({
  query: (sql) => c.query(sql),
  [Symbol.dispose]: () => c.end(),
});
```

</div>

</div>

- 行数も型安全性も互角。class 版は **Q2 の this 落とし穴の上に乗る**
- **class が圧倒的に勝つわけではない**。好み・チームの慣性で選んでよい

<MessageBox>

**Symbol.dispose 単体に class 必然性はない。文脈で選ぶ**

</MessageBox>

<style>
code {
  font-size: 12px;
  line-height: 14px;
}
</style>

---
layout: section
---

# 5. まとめ

---

# 立場ごとの戦略

**class を使うかどうかは、多くの場合フレームワークが決める**

<div class="grid grid-cols-2 gap-6 mt-2">

<div>

### class を書く側

Angular / NestJS / TypeORM

- フィールド型に **Branded Type** を入れる
- decorator が要らないメソッドは  
**アロー関数フィールド**で lexical this に固定する
- ドメインロジックは class 外に**関数として**切り出す

</div>

<div>

### class を使わない側

React / Vue 3 / Hono / Elysia / 自分のドメイン層

- ID は **Branded Type + スキーマ**で値に
- 種別は **Discriminated Union**で判別
- 振る舞いは **関数**、テストはダミー値で

</div>

</div>

<MessageBox>

同じ値の世界という原理から、立場ごとに違う戦術が出てくる

</MessageBox>

<div class="mt-4 text-xs opacity-60">

※ 厳密には React にも class component が残るなど、双方を利用できるライブラリ・FWもある<br/>
本資料では各ライブラリ・FWで支配的なスタイルで区分けしている

</div>

