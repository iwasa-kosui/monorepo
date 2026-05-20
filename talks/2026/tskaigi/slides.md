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

<!--
皆さん、こんにちは。本日は「TypeScriptのclassはなぜこうなったのか」というテーマでお話しさせていただきます。
TypeScriptのclassに癖を感じたことはありますか。その複雑さがどこから来ているのか、30分で紐解いていきます。
-->

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

<!-- 自己紹介は画面を見ていただければと思います。カケハシで認証権限基盤チームのテックリードをしている岩佐です。TSKaigi 2024では「fp-tsのチーム活用術」というタイトルで登壇しました。本日はよろしくお願いいたします。 -->

---

# 挙手をお願いします✋

<div class="mt-24 text-center opacity-90">
<div class="text-3xl">

TypeScript の class の挙動に驚いたことがある方✋

</div>
<div class="text-2xl">

JavaやC#、Go、Rustなど  
他の静的型付け言語に馴染みがある方は  
身に覚えがあるはず

</div>
</div>

<!--
本題に入る前に、皆さんに挙手で伺いたいと思います。TypeScriptのクラスの挙動に「あれっ？」と驚いたことがある方、いらっしゃいますか。
特にJavaやC#、Go、Rustといった他の静的型付け言語に馴染みのある方なら、一度はハマったことがあるはずです。多くの方が手を挙げてくださっていますね、ありがとうございます。
-->

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

<div class="mt-8 text-base opacity-80">

日々 class を書いている方にとっても、避けている方にとっても<br/>改めて考えるきっかけになれば嬉しいです

</div>

<!--
本題に入る前に、本日のテーマをお伝えします。
TypeScript の class を、まずはよく知っていただく。歴史と仕組みを紐解き、落とし穴がどこから生まれているのかを根本原因まで降りて整理します。その上で、これから自分のプロジェクトで class とどう付き合っていくかを、改めて考える時間にできればと思っています。
答えは一つではありません。日々 class を書いている方も、なるべく避けている方も、今日の30分が改めて考えるきっかけになれば幸いです。
-->

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

<!--
テーマに入る前に、まずクイズで問題意識を共有させてください。
JavaやC#の感覚と食い違う3つのコードをお見せします。ここで皆さんが感じる違和感こそ、今日30分でお話しする内容の出発点になります。
短いコードを3つお見せしますので、思った通りか、何か違うか、心の中で答えてみてください。答えはこの後の30分ですべて明かされる構成になっています。それでは1問目です。
-->

---

# Q1. このコード、コンパイルは通る？

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

- **A.** コンパイル時に型エラー
- **B.** コンパイルも実行も通る
- **C.** 実行時に TypeError

</div>

</div>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

<!--
1問目です。UserとProductは別のクラスですが、Userを受け取る関数greetにProductを渡しています。JavaやC#なら確実にコンパイルエラーですが、TypeScriptはA・B・Cのどれでしょうか。
-->

---

# Q1の答え: B. コンパイルも実行も通る

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

### コンパイル

通過する

### 実行時

```text
Hello, 
```

</div>

</div>

<MessageBox>

User クラスを引数にとる関数に  
Productを代入してもコンパイルも実行もできる

</MessageBox>

<style>
code {
  font-size: 14px;
  line-height: 14px;
}
</style>

<!--
答えはBです。型エラーは出ず、実行も通って Hello, 空文字 と出力されます。同じ構造の異なるクラスを、TypeScriptは区別しません。Java開発者なら誰しもが「えっ？」となるところです。
-->

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

<!--
2問目です。Uploaderクラスのuploadメソッドを変数fnに代入してから呼び出しています。コールバックに渡す場面で日常的に発生するパターンです。実行すると何が起きるでしょうか。
-->

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

### コンパイル

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

<!--
答えはCです。コンパイルは通りますが、実行するとTypeErrorが投げられます。メソッドを変数経由で呼んだだけでthisが消える、Java開発者にとっては想像もしない挙動です。
-->

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

<!--
3問目です。BaseクラスにxのsetterがあるところをSubクラスでフィールドとして上書きしています。JavaやC#ならsetterが呼ばれそうですが、TypeScriptはどうでしょうか。なぜそうなるのかが本丸です。
-->

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

### コンパイル

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

<!--
答えはCです。コンパイルはどちらの設定でも通ります。useDefineForClassFieldsというtsconfigフラグで実行時の挙動が変わり、falseなら親のsetterが呼ばれ、trueなら呼ばれません。同じコードがコンパイラ設定で別の動きをする、Java開発者なら受け入れがたい状況です。なぜこんな状況になったのでしょうか。
-->

---

# 問い

<MessageBox>

TypeScript の class は<br/>なぜこのような挙動になっているのか

</MessageBox>

<div class="mt-10">

- この挙動を採用した設計の背景と意図は何か
- そして、私たちはこの class とどう付き合っていけばいいのか

</div>

<div class="mt-8 text-base opacity-80">

この問いに、これから30分かけて向き合っていきます

</div>

<!--
3問のクイズを終えたところで、一度立ち止まって問いを投げかけさせてください。
TypeScript の class は、なぜこんな挙動になっているのでしょうか。3つの挙動はそれぞれ別の話なのか、それとも共通する理由があるのか。これは設計ミスなのか、それとも仕方のない事情があったのか。そして、私たちはこの class とどう付き合っていけばいいのか。
クイズで感じた違和感を、こうした問いに広げていきたいと思います。これから30分かけて、この問いに向き合っていきます。
-->

---

# 本日の構成


1. **歴史**  
  なぜ今の挙動になっているのか
2. **落とし穴と対策**  
  4つの落とし穴を、それぞれの直後に対策とセットで
3. **クラスがない世界**  
  「使えない」ではなく「使わない」マインドセット
4. **まとめ**  
  立場ごとの、これからの付き合い方

<!--
本日は大きく3部構成です。まず歴史篇でTypeScriptのclassがなぜ今の形になったかを追います。ここでQ3の答えが出ます。
次に「落とし穴と対策」篇では、4つの落とし穴それぞれについて、現象・なぜそうなるのか・どう対処するかを一続きで示します。Q1とQ2の答えはここで出ます。
3部目では視点を切り替えて、「そもそも class を使わない世界」が TypeScript ではどう成り立つのかを見ます。落とし穴の裏返しとしてではなく、別の選択肢として提示します。
最後にまとめとして、フレームワークがclassを要求する現実の中で、立場ごとの付き合い方を整理します。
-->

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

<!--
なぜわざわざ歴史を知る必要があるのでしょうか。TypeScriptのclassの複雑さは、誰かの設計ミスではありません。TypeScriptがECMAScriptより先にclassを実装し、後から標準仕様が決まったことで、両者を統合する長い旅が始まりました。この歴史を知ることで、「なぜこうなっているのか」が腹落ちします。
-->

---

# ES4 の挫折 と ES2015 の最小設計

### 2008: ES4 廃棄

- class・強い型付けを含む **ES4** を Microsoft 等が反対、2008 年に廃棄
- 直後に **CoffeeScript** など「class を持つ AltJS」が広がる

### 2015: maximally minimal classes

- ES4 の反省から、TC39 全員が合意できる**最小限**の class を ES2015 に
- private / static fields / decorators は**すべて後回し**
- 中身は prototype チェーンの**シンタックスシュガー**

<MessageBox>

「最小限で始めて後から積む」設計が<br/>その後の長い追いかけっこを生む種になった

</MessageBox>

<!--
classの歴史は ES4 の挫折から始まります。2008年、class や強い型付けを含む野心的な ES4 は、互換性破壊への懸念から廃棄されました。class 構文を持たない JavaScript への渇望は CoffeeScript などの AltJS に流れます。
ES2015 でようやく class が標準化されますが、ES4 の反省から「全員が合意できる最小限」だけが入りました。private や static fields、decorators はすべて後回し。中身はあくまで prototype のシンタックスシュガーです。
この「最小限で始めて後から積む」アプローチが、後の追いかけっこを生む種になりました。
-->

---

# TypeScript誕生とclassの先行実装 (2012)

ES6 より3年先に class をサポート。設計者 Anders Hejlsberg（C# 設計者）の影響で `public` / `private` / `protected` を初版から搭載

<div class="grid grid-cols-2 gap-6 mt-4 items-start">

<div>

### コンパイル前 (TypeScript 0.8)

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

### コンパイル後 (ES5)

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

<!--
2012年、TypeScript 0.8がリリースされます。ES2015より3年も先にclass構文をサポートしました。設計者のAnders HejlsbergはC#の設計者でもあり、public/private/protectedといったアクセス修飾子を初版から備えていました。
コンパイル時にはES5互換のprototypeベースのコードに変換されます。左側のTypeScriptクラスが、右側のような prototype チェーンを使った関数として展開される、というのが当時のTypeScriptの姿でした。この先行実装は大きな恩恵をもたらしましたが、同時に後の互換性課題の種にもなりました。
-->

---

# `[[Define]]` vs `[[Set]]` 論争

ES 仕様の内部メソッド表記。`[[Set]]` は代入相当、`[[Define]]` は `Object.defineProperty` 相当

TypeScriptが先行実装したクラスフィールドのセマンティクスが、後からES標準と食い違った

<div class="grid grid-cols-2 gap-6 mt-4">

<div>

### `[[Set]]` (TypeScript当初)

```typescript
// this.x = value 相当
// スーパークラスのsetterを呼ぶ
class Base {
  set x(v: number) { console.log("setter!", v); }
}
class Sub extends Base {
  x = 42; // setter!が呼ばれる
}
```

</div>

<div>

### `[[Define]]` (ES2022標準)

```typescript
// Object.defineProperty相当
// setterをバイパスする
class Base {
  set x(v: number) { console.log("setter!", v); }
}
class Sub extends Base {
  x = 42; // setterは呼ばれない!
}
```

</div>

</div>

`useDefineForClassFields` フラグで切り替え。`target` が ES2022 以上のとき、フラグ未指定なら `true`

<!--
TypeScriptが先行実装したクラスフィールドは、代入に相当するSetセマンティクスでした。しかしTC39はObject.definePropertyに相当するDefineセマンティクスを採用しました。
違いはスーパークラスにsetterがある場合に顕著です。Setではsetterが呼ばれますが、Defineではバイパスされます。この食い違いはMobXやTypeORMなどのフレームワークに破壊的影響を与えました。
TypeScript 3.7でuseDefineForClassFieldsフラグが導入され、ES2022以上ではデフォルトでDefine（ES標準準拠）になります。仕様より早く実装することの「コスト」を示す教訓です。
-->

---

# デコレーターの10年の旅

### Legacy → Stage 3

- 2014: Yehuda Katz が TC39 に提案 → TS 1.5 が `--experimentalDecorators` で実装
- Angular / NestJS / MobX / TypeORM が legacy に深く依存
- 2022: Stage 3 到達。**API が legacy と互換性なし**
- 2023: TS 5.0 で Stage 3 をサポート

<MessageBox>

10年かかった結果、`experimentalDecorators` と Stage 3 が**並存**<br/>同じ「class に書く @」が、フラグで全く別物になる

</MessageBox>

<!--
デコレーターの標準化には10年かかりました。2014年に TC39 に提案され、翌年 TypeScript 1.5 が experimentalDecorators フラグで実装。Angular / NestJS / MobX / TypeORM がこの legacy 仕様に深く依存しました。
2022年に Stage 3 に到達した新仕様は legacy と互換性がありません。TypeScript 5.0 で Stage 3 がサポートされたものの、experimentalDecorators は後方互換のため存続。同じ @ 構文がフラグ次第で別物として振る舞う、という状況になっています。
新規ライブラリは Stage 3 一択ですが、既存フレームワーク依存があるアプリは legacy 継続が現実解、というのが2026年時点の状況です。
-->

---
layout: center
class: text-center
---

# 歴史篇まとめ

<MessageBox>

classの複雑さは<br/>ECMAScriptとの「追いかけっこ」の歴史的産物

</MessageBox>

TypeScriptが先行実装 → ECMAScriptが標準化 → 両者を統合  
このサイクルが`useDefineForClassFields`やデコレーターの二重仕様を生んだ

<!--
歴史篇のまとめです。TypeScriptのclassの複雑さは誰かの設計ミスではなく、ECMAScriptとの追いかけっこの歴史的産物です。TypeScriptが先行実装し、後からECMAScriptが標準化し、両者を統合する。このサイクルがuseDefineForClassFieldsやデコレーターの二重仕様といった複雑さを生みました。
この歴史的背景を踏まえて、次は開発者が実際に遭遇する落とし穴を見ていきましょう。
-->

---
layout: section
---

# 2. 落とし穴と対策

それぞれの落とし穴に、その場で対処を示す

---
layout: center
---

# 3つの特性

<CardGrid :cols="3">
  <Card title="構造的部分型" description="型の互換性は名前ではなく構造で決まる" />
  <Card title="型消去" description="TypeScriptの型情報は実行時に消える" />
  <Card title="プロトタイプベース" description="プロトタイプOOPであるJSはクラスをシンタックスシュガーで表現" />
</CardGrid>

<!--
落とし穴篇に入る前に、根本原因を3つ提示します。構造的部分型、型消去、そしてprototypeの動的thisです。
構造的部分型とは、型の互換性が名前ではなく構造で決まる仕組みです。型消去とは、TypeScriptの型情報がトランスパイル時に消え、実行時には存在しないことです。prototypeの動的thisは、メソッドの呼び出し方によってthisが変わるJavaScriptランタイム側の仕様です。
これから紹介する4つの落とし穴を、この3つの原因がそれぞれ生むものとして整理して見ていきます。構造的部分型から1つ、型消去から2つ、動的thisから1つ。同じ原因の落とし穴を連続して見ることで、対策の方向性も見通しやすくなります。
-->

---

# 落とし穴1: 構造的部分型

<div class="text-sm opacity-70 mb-4">原因 1: 構造的部分型</div>

```typescript
class User    { constructor(public id: string, public name: string) {} }
class Product { constructor(public id: string, public name: string) {} }

const sortByUserId = (users: ReadonlyArray<User>): ReadonlyArray<User> =>
  [...users].sort((a, b) => a.id.localeCompare(b.id));

sortByUserId([new User("1", "田中"), new Product("2", "商品A")]); // エラーなし!
```

- TypeScript は**構造で互換**を判断 → クラス名が違っても通る
- Java はクラスローダーが型のアイデンティティを持つが、JS にはそれが**存在しない**
- 既存 JS との互換性を優先した TypeScript の必然的な選択

<!--
まずは原因1、構造的部分型が生む落とし穴です。
User と Product は名前が違いますが、id と name という同じ構造を持っており、sortByUserId に Product を渡してもエラーになりません。
なぜか。Java ではクラスローダーが型のアイデンティティを管理しますが、JavaScript にはそれが存在しません。class で作ろうがオブジェクトリテラルで作ろうが同じように使える、というのが JavaScript の柔軟性で、TypeScript はそれを壊さないために構造的部分型を採用しました。互換性のための必然的な選択です。
-->

---

# 対策1: Branded Type で「名前」を値に埋め込む

```typescript
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

type UserId    = Brand<string, "UserId">;
type ProductId = Brand<string, "ProductId">;

const UserId    = z.uuid().brand<"UserId">();    // Zod なら検証も同時に
```

- 文字列タグでブランドを付与 → 構造が同じでも**型レベルで区別**
- `unique symbol` を使うのでランタイムコストはゼロ
- class のフィールド型に使えば NestJS / TypeORM の Entity でも有効

<!--
構造的部分型への対策が Branded Type です。ユニークな symbol プロパティと文字列タグで型にブランドを付与し、構造が同じでも異なる型として扱えるようにします。Zod の brand を使えば外部入力のバリデーションとブランド付与を同時にできます。
ここで重要なのは、ブランドは「class の名前」を値の世界に持ち込んだものだ、という点です。class のフィールド型に使えば NestJS や TypeORM の Entity でも効きますし、class を使わない値ベースのコードでも同じように働きます。後半で改めて触れます。
次は原因2、型消去の話に移ります。型消去はこのあと private と instanceof という2つの落とし穴を連続して生みます。
-->

---

# 落とし穴2: private 修飾子が実行時に効かない

<div class="text-sm opacity-70 mb-4">原因 2: 型消去 (1/2)</div>

```typescript
class Account { private balance = 10000; }

const acc: any = new Account();
console.log(acc.balance); // 10000 — any キャストで素通り
```

- TS の `private` はコンパイル時の型検査のみ。トランスパイルで**消える**
- TS 2012 当時の JS には実行時プライバシーが**存在しなかった**ための型レベル近似
- ES2022 でようやく `#private` が標準化されるまで10年

<!--
原因2、型消去が生む落とし穴の1つ目は private 修飾子です。TS の private は any キャストやブラケット記法で簡単に回避でき、トランスパイル後の JavaScript には何の痕跡も残りません。
なぜか。TypeScript が private を実装した2012年時点では JavaScript に実行時プライバシーが存在しませんでした。ES2022 で # private が標準化されるまで10年かかり、TS の private はその間の「型レベルの近似」として生きてきたのです。
-->

---

# 対策2: ES `#private` で実行時にも保護

```typescript
class Account {
  #balance = 10000;            // # で実行時のアクセスも禁止
  getBalance() { return this.#balance; }
}
const acc: any = new Account();
acc.#balance; // SyntaxError — any キャストでも到達不可
```

- TS `private` は型レベルの「お願い」、ES `#private` は実行時のハード保護
- ただし `structuredClone` / `JSON.stringify` 不通過、Proxy 経由で TypeError になりがち
- **外部公開ライブラリ**は `#private`、**内部アプリ**は `private` でも実用上十分

<!--
private への対策は ES の # private フィールドです。TS 3.8 からサポートされています。# private は構文レベルで実行時アクセスを禁じるため、any キャストでも Reflect.ownKeys でも到達できません。
ただし注意点があります。structuredClone や JSON.stringify を素通りしないため、永続化やプロセス間転送する型では設計が変わります。
使い分けは、外部公開ライブラリや SDK は # private、内部アプリは TS private でも実用上十分、というのが私の判断軸です。
続けて型消去のもう1つの落とし穴、instanceof を見ます。
-->

---

# 落とし穴3: instanceof で interface を判定できない

<div class="text-sm opacity-70 mb-4">原因 2: 型消去 (2/2)</div>

```typescript
interface Drawable { draw(): void; }
function render(item: Drawable) {
  if (item instanceof Drawable) { /* Error: only refers to a type */ }
}
```

- `interface` / `type` はトランスパイルで**消える**ので `instanceof` の対象にできない
- TS は「JS に型を追加する」言語で、新しいランタイム構造を入れない原則
- class に対する `instanceof` でさえ、構造的部分型と組み合わさると当てにならない

<!--
型消去が生む落とし穴の2つ目は instanceof です。interface に対して instanceof を使おうとするとコンパイルエラーになります。interface はトランスパイルで消えるため、実行時には存在しません。
TypeScript は「JavaScript に型を追加する」言語で、新しいランタイム構造を導入しない原則を持っています。interface や type は純粋にコンパイル時の概念で、JavaScript 出力には何も残らない。class に対する instanceof でさえ、構造的部分型と組み合わさると期待通り動かないケースがあります。
-->

---

# 対策3: Discriminated Union でタグを値に置く

```typescript
type Shape =
  | Readonly<{ kind: "circle"; radius: number }>
  | Readonly<{ kind: "square"; side: number }>;

const area = (s: Shape): number => {
  switch (s.kind) {
    case "circle": return Math.PI * s.radius ** 2;
    case "square": return s.side ** 2;
    default: { const _: never = s; return _; }  // 網羅性チェック
  }
};
```

- `kind` は**実行時に残る値** → 型消去の影響を受けない
- 新しい variant 追加時に `never` の網羅性チェックがコンパイル時に弾く
- `instanceof` では得られない、判別と網羅性の両立

<!--
instanceof への対策は Discriminated Union です。kind というタグフィールドを持たせ、switch で型を判別します。
ポイントは2つ。kind は実行時に残る「値」なので、interface のように消えません。そして default 節の never による網羅性チェックで、新しい variant を追加したときに case を書き忘れるとコンパイルエラーになります。instanceof では得られない安全性です。
型消去に対しては #private と Discriminated Union という2方向の対策があるわけですが、どちらも結局「値として残るもの」を使っています。次は最後の原因、prototype の動的this です。
-->

---

# 落とし穴4: this バインディング

<div class="text-sm opacity-70 mb-4">原因 3: prototype の動的this</div>

```typescript
class Uploader {
  private storage = "/tmp";
  upload(fileName: string) { console.log(`${fileName} → ${this.storage}`); }
}

const uploader = new Uploader();
[1].forEach(uploader.upload);  // TypeError: Cannot read properties of undefined
```

- JS のメソッド呼び出しは「プロパティ参照」と「`this` 設定」の**2 ステップ**
- 変数代入やコールバック渡しは**1 ステップ目だけ**実行され、`this` が切り離される
- 歴史篇の TS 0.8 → ES5 を思い出して: class は今も `prototype` の構文糖

<!--
最後の原因3、prototype の動的this が生む落とし穴です。メソッドをコールバックとして渡すと this が undefined になり TypeError が出ます。
JavaScript のメソッド呼び出しは内部的に2ステップ動作します。プロパティ参照と this 設定です。変数経由で呼ぶと1ステップ目だけが実行され、this が切り離されます。
歴史篇で見た TypeScript 0.8 のコンパイル後の ES5、覚えていますか。今書いている class の中身は当時の prototype.greet = function() のままで、シンタックスシュガーが掛かっているだけ。この動的 this はその名残です。
-->

---

# 対策4: 「this を持たない関数」に逃がす

```typescript
// 対策4-a: class 内で対処 — アロー関数フィールドで lexical this
class Uploader {
  upload = (fileName: string) => { console.log(`${fileName} → ${this.storage}`); };
}

// 対策4-b: class から離脱 — そもそも this を作らない
type Uploader = Readonly<{ storage: string }>;
const upload = (u: Uploader) => (fileName: string) =>
  console.log(`${fileName} → ${u.storage}`);
```

- **4-a**: lexical this で切り離しを防ぐ。ただし decorator / AOP は効かない
- **4-b**: this を持たない関数なら、そもそも切り離す対象がない

<!--
動的this への対策は2つあります。
4-a は class を使い続ける場合の基本パターン、アロー関数フィールド。lexical this で this を切り離さないようにします。ただし prototype に載らずインスタンスごとにコピーされ、decorator や AOP の対象外になる注意点があります。
4-b は class から離れて関数として書くパターン。this を持たない関数なら、そもそも切り離す対象がありません。落とし穴4は構造的に発生しなくなります。後半の「クラスがない世界」で改めて掘ります。
ここまでで、3つの原因が生む4つの落とし穴と、それぞれの対策を一通り見ました。次は視点を変えて、これら4つの対策を貫く共通の構図を見ていきます。
-->

---
layout: section
---

# 3. クラスがない世界

「使えない」から「使わない」へ

---

# 対策はぜんぶ「値」で出来ていた

<div class="grid grid-cols-2 gap-6 mt-2">

<div>

### Java の世界

- **classloader** が型のアイデンティティを実行時に保持
- リフレクションで型を問い合わせ、`instanceof` も `isAssignableFrom` も使える

### TypeScript の世界

- 実行時に型情報は**存在しない**
- 「できないこと」だと思いがち

</div>

<div>

### 値で表現する3つの道具

| 失われたもの | 値で取り戻す |
|---|---|
| 名前(アイデンティティ) | **Branded Type** |
| 種別の判別 | **Discriminated Union** |
| 振る舞い | **関数**（this を持たない） |

ここまでの4つの対策はすべてこの組み合わせ

</div>

</div>

<MessageBox>

TypeScript では関数も値であるように、<u>すべてを値として表現できる</u>

</MessageBox>

<!--
ここで一度ズームアウトします。実は、ここまで見てきた4つの対策はすべて「値」で出来ていました。
Java の世界では classloader が型のアイデンティティを実行時に保持し、リフレクションで型を問い合わせることができます。TypeScript ではそれが実行時に取れず、私たちはそれを「できないこと」と捉えがちです。
でも、TypeScript には別の道があります。関数も値であるように、すべてを値として表現できる。名前のアイデンティティは Branded Type、種別の判別は Discriminated Union、振る舞いは this を持たない関数。これらは実行時にも残る「値」です。
落とし穴の対策を個別に覚えるのではなく、「失われたものを値で取り戻す」という共通の構図として見えてくると、class を使うかどうかが新しい意味を持ってきます。
-->

---

# 関数のシグニチャが契約そのものになる

```typescript
const findUserById: (id: UserId) => Promise<User | null>
```

- **(入力型 → 出力型)** を読むだけで、何を渡せば何が返るかが決まる
- Java なら classloader を辿って実装クラスを探したり、リフレクションで型を問い合わせたりするところを、TypeScript では**シグニチャ1行で完結**
- IDE 補完・型推論・grep だけで振る舞いを追える静的な契約

<MessageBox>

実行時の型情報がなくても、<br/>**シグニチャを読めば振る舞いが分かる**

</MessageBox>

<!--
値の世界では、契約が関数のシグニチャに集約されます。入力型と出力型を読めば、何を渡せば何が返るかが決まる。
Java なら、ある interface を満たす実装クラスを classloader から探したり、リフレクションで型を問い合わせたりする必要があります。TypeScript ではシグニチャ1行で完結します。
ここで重要なのは、これが「実行時の型情報がない」ことの裏返しだということです。型情報が実行時に消えるからこそ、契約はすべて静的に、シグニチャに書き切られている必要がある。これは制約のように見えて、実は IDE 補完・型推論・grep だけで振る舞いを追える、という強力な静的読解性を与えてくれます。
-->

---

# テストも値だけで完結する

```typescript
const UserId = z.uuid().brand<"UserId">();
type UserId = z.infer<typeof UserId>;

// 本番もテストも、同じ「値の作り方」
const id: UserId = UserId.parse(crypto.randomUUID());
expect(await findUserById(id)).toBeNull();
```

- ダミー値はシグニチャを満たせば十分 → **コンストラクタもモックライブラリも要らない**
- Branded Type + スキーマライブラリで、**本番と同じ検証ロジックで作った値**をテストにも持ち込める
- class なら `new` で組み立てて、protected を public に開けて...という足場がいらない

<MessageBox>

マインドセットを変えると、<br/>「クラスがない世界」は不便ではなく**自由**

</MessageBox>

<!--
シグニチャが契約だということは、テストにも大きな帰結があります。ダミー値はシグニチャを満たせば十分なので、コンストラクタもモックライブラリも要らない。
さらに Branded Type とスキーマライブラリを組み合わせれば、本番と同じ検証ロジックで作った値をテストにも持ち込めます。Zod の parse を通せば、テストで使う UserId も本番で使う UserId も、同じ「正しい値」です。
class ベースだとどうしても、new で組み立てたり、テストのために protected を public に開けたり、モックのインターフェースを定義したり、という足場が必要になります。値の世界ではそれがありません。
ここまで来ると、「class が使えない」ではなく「class を使わない選択肢がある」ことが見えてきます。マインドセットを変えれば、クラスがない世界は不便ではなく自由です。
-->

---
layout: section
---

# 4. まとめ

---

# 立場ごとの戦略

**class を使うかどうかは、多くの場合フレームワークが決める**

<div class="grid grid-cols-2 gap-6 mt-2">

<div>

### class を書かざるを得ない側

Angular / NestJS / Web Components / TypeORM

- フィールド型に **Branded Type** を入れる
- 外部公開には **`#private`** を選ぶ
- decorator が要らないメソッドは**アロー関数フィールド**で this を逃がす
- ドメインロジックは class の外に**関数として**切り出す

</div>

<div>

### class を使わない側

React / Vue 3 / Hono / Elysia / 自分のドメイン層

- ID は **Branded Type + スキーマ**で値に
- 種別は **Discriminated Union**で判別
- 振る舞いは **関数**、テストはダミー値で
- フレームワーク選定で class 強制度を**批評の材料**に

</div>

</div>

<MessageBox>

同じ「値の世界」という原理から、立場ごとに違う戦術が出てくる

</MessageBox>

<!--
最後に立場ごとの戦略です。class を使うかどうかは、多くの場合フレームワークが決めます。Angular / NestJS / Web Components / TypeORM では class を書かざるを得ません。
書かざるを得ない側は、フィールド型に Branded Type を入れる、外部公開には # private を選ぶ、decorator が要らないメソッドはアロー関数フィールドで this を逃がす、ドメインロジックは class の外に関数として切り出す。落とし穴を値で受け止めて、限定された範囲で class を扱います。
書かない側は、ID は Branded Type + スキーマ、種別は Discriminated Union、振る舞いは関数、テストはダミー値で。そしてフレームワーク選定の際に、その class 強制度を批評の材料として持っておく。
どちらの立場でも、根っこは同じ「値の世界」という原理です。そこから戦術が分かれます。
-->

---

# 3つの持ち帰りポイント

<CardGrid :cols="3">
  <SummaryCard :number="1" title="歴史的必然" description="classの複雑さはECMAScriptとの「追いかけっこ」の産物" subdescription="設計ミスではなく、TypeScript と JavaScript の重なりが生んだ形" />
  <SummaryCard :number="2" title="3つの根本原因" description="構造的部分型 / 型消去 / prototypeの動的this" subdescription="個別の落とし穴を暗記するより、この3つを理解する" />
  <SummaryCard :number="3" title="値で取り戻す世界観" description="Branded Type / Discriminated Union / 関数で、失われたものを値で取り戻せる" subdescription="「クラスがない世界」は制約ではなく自由" />
</CardGrid>

<!--
持ち帰りポイントを3つにまとめます。
1つ目、classの複雑さは歴史的必然です。設計ミスではなく、TypeScript と JavaScript の重なりが生んだ形であり、その歴史を踏まえて付き合うべきものです。
2つ目、構造的部分型・型消去・prototypeの動的this という3つの根本原因を理解すれば、個別の落とし穴を暗記しなくても体系的に見えるようになります。
3つ目、Branded Type / Discriminated Union / 関数によって、class が持っていた「名前」「種別」「振る舞い」を値の世界で取り戻すことができます。マインドセットを変えれば、クラスがない世界は制約ではなく自由です。立場ごとの戦術は違っても、根っこは同じ原理から出てきます。class を書き続ける方も、避けてきた方も、この「値の世界」を共通の語彙として持ち帰ってください。
-->

---
layout: center
class: text-center
---

# ご清聴ありがとうございました

<div class="mt-8 space-y-2">
  <div class="text-lg">X: @kosui_me</div>
  <div class="text-lg">GitHub: @iwasa-kosui</div>
  <div class="text-lg">Web: https://kosui.me</div>
</div>

<div class="mt-8 text-sm opacity-60">

関連記事: [他言語経験者が知っておきたいTypeScriptのクラスの注意点](https://kakehashi-dev.hatenablog.com/entry/2025/08/19/110000)

</div>

<!--
ご清聴ありがとうございました。関連するブログ記事のリンクも載せていますので、より詳しいコード例はそちらをご覧ください。ご質問があればお気軽にどうぞ。
-->
