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
TypeScript の class を、まずはよく知っていただく。歴史と仕組みを順に説明し、落とし穴の根本原因まで遡って整理します。その上で、これから自分のプロジェクトで class とどう付き合っていくかを、改めて考える時間にできればと思っています。
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

<!--
1問目です。UserとProductは別のクラスですが、Userを受け取る関数greetにProductを渡しています。JavaやC#なら確実にコンパイルエラーですが、TypeScriptはA・B・Cのどれでしょうか。
-->

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

<!--
答えはCです。トランスパイルは通りますが、実行するとTypeErrorが投げられます。メソッドを変数経由で呼んだだけでthisが消える、Java開発者にとっては想像もしない挙動です。
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
3問目です。BaseクラスにxのsetterがあるところをSubクラスでフィールドとして上書きしています。JavaやC#ならsetterが呼ばれそうですが、TypeScriptはどうでしょうか。なぜそうなるのかが、この問題の中心的な論点です。
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

<!--
答えはCです。トランスパイルはどちらの設定でも通ります。useDefineForClassFieldsというtsconfigフラグで実行時の挙動が変わり、falseなら親のsetterが呼ばれ、trueなら呼ばれません。同じコードがビルド設定で別の動きをする、Java開発者なら受け入れがたい状況です。なぜこんな状況になったのでしょうか。
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
2. **特性と対策**  
  3つの特性と、それが生む落とし穴・対策をセットで
3. **クラスがない世界**  
  トランスパイル時にも実行時にも参照できる「値」で全てを表現する
4. **まとめ**  
  立場ごとの、これからの付き合い方

<!--
本日は大きく3部構成です。まず歴史編でTypeScriptのclassがなぜ今の形になったかを追います。ここでQ3の答えが出ます。
次に「特性と対策」編では、TypeScript の class を生み出している3つの特性それぞれについて、それが招く落とし穴と対策をひと続きで見ていきます。Q1とQ2の答えはここで出ます。
3部目では視点を切り替えて、「そもそも class を使わない世界」が TypeScript ではどう成り立つのかを見ます。落とし穴を回避するための消極的な選択ではなく、独立した別の選択肢として提示します。
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
なぜわざわざ歴史を知る必要があるのでしょうか。TypeScriptのclassの複雑さは、誰かの設計ミスではありません。TypeScriptがECMAScriptより先にclassを実装し、後から標準仕様が決まったことで、両者を整合させる長期の作業が始まりました。この歴史を知ることで、「なぜこうなっているのか」が理解できます。
-->

---

# ES4 の挫折 と ES2015 の最小設計

### 2008: ES4 廃棄

- class・強い型付けを含む **ES4** を Microsoft 等が反対、2008 年に廃棄
- 直後に **CoffeeScript** など「class を持つ AltJS」が広がる

### 2015: maximally minimal classes

- ES4 の反省から、TC39 全員が合意できる**最小限**の class を ES2015 に
- private / static fields / decorators は**すべて後回し**
- 中身は**プロトタイプに基づいて構築**された構文

<MessageBox>

「最小限で始めて後から積む」設計が<br/>後の TypeScript と ECMAScript の整合作業の原因になった

</MessageBox>

<!--
classの歴史は ES4 の挫折から始まります。2008年、class や強い型付けを含む野心的な ES4 は、互換性破壊への懸念から廃棄されました。class 構文を持たない JavaScript を補うため、CoffeeScript などの AltJS が広まります。
ES2015 でようやく class が標準化されますが、ES4 の反省から「全員が合意できる最小限」だけが入りました。private や static fields、decorators はすべて後回し。中身はあくまでプロトタイプに基づいて構築された構文です。
この「最小限で始めて後から積む」アプローチが、後に TypeScript と ECMAScript を整合させ続けるコストの原因になりました。
-->

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

<!--
2012年、TypeScript 0.8がリリースされます。ES2015より3年も先にclass構文をサポートしました。設計者のAnders HejlsbergはC#の設計者でもあり、public/private/protectedといったアクセス修飾子を初版から備えていました。
トランスパイル時にはES5互換のprototypeベースのコードに変換されます。左側のTypeScriptクラスが、右側のような prototype チェーンを使った関数として展開される、というのが当時のTypeScriptの姿でした。この先行実装は大きな恩恵をもたらしましたが、同時に後の互換性課題の原因にもなりました。
-->

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

<!--
クラスフィールド「x = 42」を JS のどんなコードに変換するか、で親の setter を呼ぶかが変わります。これが [[Set]] と [[Define]] の論争です。
Base に setter があって Sub で x = 42 と書くケースを考えてください。次のスライドで2つの解釈を並べます。
-->

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

## 仕様差異の吸収

TypeScript 3.7 で `useDefineForClassFields` を導入

- `target: ES2022` 以上なら既定 `true`（`[[Define]]`）
- それ以外は既定 `false` (`[[Set]]`)

<!--
2つの解釈を並べました。
左は当初の TypeScript の解釈。constructor 内で this.x = 42 と書くのと等価で、代入なので親の setter が呼ばれ、setter! 42 が出力されます。
右は ES2022 で標準化された解釈。Object.defineProperty で新しいプロパティを直接定義するので、継承された setter はバイパスされ、何も出力されません。
この食い違いは MobX や TypeORM などのフレームワークに破壊的な影響を与えました。TypeScript 3.7 で useDefineForClassFields フラグが導入され、target が ES2022 以上では既定で標準準拠の Define になります。仕様より早く実装することの「コスト」を示す教訓です。
-->

---
layout: center
class: text-center
---

# 歴史編まとめ

<MessageBox>

classの複雑さは<br/>ECMAScript との長期にわたる整合作業の歴史的産物

</MessageBox>

<!--
歴史編のまとめです。TypeScriptのclassの複雑さは誰かの設計ミスではなく、ECMAScript の標準化と TypeScript の先行実装を整合させ続けた結果です。TypeScript が先行実装し、後から ECMAScript が標準化し、両者を整合させる。この繰り返しが useDefineForClassFields のような仕様の食い違いを生み、今の複雑さの原因になっています。
この歴史的背景を踏まえて、次は開発者が実際に遭遇する落とし穴を見ていきましょう。
-->

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

<!--
ここからは TypeScript の class を形作っている3つの特性を見ていきます。構造的部分型、型消去、プロトタイプベース。
構造的部分型とは、型の互換性が名前ではなく構造で決まる仕組みです。型消去とは、TypeScript の型情報がトランスパイル時に消え、実行時には存在しないこと。プロトタイプベースとは、class は今も prototype に基づいて構築されており、this が呼び出し方で動的に決まるという JavaScript の仕組みのことです。
それぞれの特性に対応する落とし穴があります。構造的部分型から1つ、型消去から2つ、プロトタイプベースから1つ。まずは1つ目、構造的部分型から見ていきましょう。
-->

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

<!--
1つ目の特性、構造的部分型です。型の互換性が、型名や継承関係ではなく、プロパティの構造で決まる仕組みです。Java / C# / Rust のような名前的部分型の言語では、型名と明示的に宣言された継承関係（extends / implements / trait 実装）で互換性が決まるため、同じ構造でも別名のクラスは区別されます。一方、JavaScript には型のアイデンティティが存在しません。class でもオブジェクトリテラルでも同じように扱えるのが JS の前提で、TypeScript はそれを維持する設計を選びました。次に、この特性が実際にどう便利で、どこに落とし穴があるのかを見ていきます。
-->

---

# 構造的部分型の便利さ

```typescript
type Logger = { log(msg: string): void };
const run = (logger: Logger) => logger.log("running");

// 本番環境: console をそのまま渡す
run(console);

// テスト: 必要なメソッドだけ持つテストダブルに差し替えられる
const logs: string[] = [];
run({ log: (m) => logs.push(m) });
```

- `implements` 宣言もモックライブラリも**不要**
- 必要な形さえ持てば、組み込み・自前・テストダブル何でも通せる

<!--
構造的部分型の便利さを見ます。Logger 型は log メソッドを持つことだけを要求します。プロダクションでは console をそのまま渡せます。console は元々 Logger を満たそうとして作られたわけではありませんが、log メソッドを持っているので構造的に通ります。
テストでは、必要な log メソッドだけを持つオブジェクトリテラルを渡せます。モックライブラリも、テスト用のクラスも要りません。同じ run に対して組み込み・自前・テストダブルが全部同じ仕組みで通る、これが構造的部分型のうれしさです。
-->

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

<!--
Q1 で見せたコードです。User と Product はクラス名が違いますが、name という同じプロパティを持っています。TypeScript は構造で互換を判定するため、greet に Product を渡してもエラーになりません。名前的部分型の言語であれば別物として扱われますが、TypeScript には型のアイデンティティが実行時にもコンパイル時にも存在しないため、構造が同じものは同じ型として通ります。
-->


---

# 対策: Branded Type で「名前」を値に埋め込む

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
構造的部分型はここまで。次の特性に進みましょう。
-->

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

<!--
3つの特性のうち1つ目、構造的部分型を見ました。次は2つ目の特性、型消去です。型消去から instanceof の落とし穴が出てきます。
-->

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
- 実行時には「値」だけが存在する

</div>

</div>

<!--
2つ目の特性、型消去です。TypeScript の型情報はトランスパイル時にすべて削除され、実行時の JavaScript には残りません。「JavaScript に型を追加する」という TypeScript の設計原則の表れで、型は実行時の振る舞いに干渉せず、トランスパイル時にだけ存在します。そのため interface・type・private/protected のような「型として宣言したもの」は、実行時のコードからは参照できません。private/protected が any キャストで素通りするのもこの帰結ですが、今日は最も影響範囲の広い instanceof の落とし穴に絞ります。
-->

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

- TS は**構造的部分型**で `r2` を `Rectangle` として受け入れる
- でも `instanceof` は  
  実行時の**プロトタイプチェーン**を  
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

<!--
型消去の落とし穴を象徴する例です。r2 は Rectangle 型として宣言されていて、TS は構造的部分型で受け入れます。しかし実行時の instanceof は new Rectangle で作られたかどうか、つまりプロトタイプチェーンを見るので、構造が同じだけの r2 は false になります。
コンパイルは通り、実行時にエラーも出ず、ただ静かに想定外の false が返る。これが「型として宣言したものと、実行時の正体は別物」という型消去の最も実用上やっかいな帰結です。
なお interface に対しては instanceof 自体が型エラーになりますが、class でも構造的に作られたオブジェクトをすり抜けるという、より気づきにくい問題があるという話です。
-->

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

<!--
対策は Discriminated Union です。kind というタグフィールドを値として持たせ、switch で判別します。
kind は実行時にも残る「値」なので、interface のように消えません。default 節の never による網羅性検証で、新しい variant を追加して case を書き忘れたらコンパイル時に弾けます。
class を作らなくても、オブジェクトリテラルでも書けます。この「値として残るものに頼る」パターンが、後半「値の世界」で再利用されます。
-->

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

<!--
構造的部分型と型消去を見てきました。最後の特性はプロトタイプベース。class は今も prototype に基づいて構築されている、という歴史編の話を思い出しながら聞いてください。
-->

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

<!--
最後の特性、プロトタイプベースです。歴史編で見た通り、JavaScript の class は prototype 上にメソッドを定義する構文を書き換えただけのものです。Java や C# ではメソッドはインスタンスに束縛されるため、this は常に同じオブジェクトを指します。一方、JavaScript ではメソッドは prototype 上の独立した関数で、this は呼び出し時のレシーバによって決まります。この特性が this バインディングの落とし穴の原因になります。
-->

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

- `uploader.upload()` の形で呼ぶと `this = uploader`
- 関数を変数経由で呼ぶと `this = undefined`（インスタンスとの紐付けが切れる）
- class は今も `prototype` に基づいて構築 → メソッドはインスタンスに束縛されず、**呼び出し方**で `this` が決まる

<!--
プロトタイプベースが引き起こす落とし穴です。`uploader.upload()` の形で呼べば this は uploader ですが、`[1].forEach(uploader.upload)` のように関数を渡すと、forEach が呼ぶときには this の情報が失われて undefined になり TypeError になります。
歴史編で見た TS 0.8 のトランスパイル後の ES5 を思い出してください。class は今も prototype 上の関数で、メソッドはインスタンスに束縛されていません。`obj.method()` という呼び方をしている間だけ this = obj が設定される、というのが JS の仕組みです。
-->

---

# 対策: 「this を持たない関数」で表現する

```typescript
// 対策a: class 内で対処 — アロー関数フィールドで lexical this
class Uploader {
  upload = (fileName: string) => { console.log(`${fileName} → ${this.storage}`); };
}

// 対策b: class から離れて関数で扱う — そもそも this を作らない
type Uploader = Readonly<{ storage: string }>;
const upload = (u: Uploader) => (fileName: string) =>
  console.log(`${fileName} → ${u.storage}`);
```

- **a**: lexical this で固定して切り離しを防ぐ。ただし decorator / AOP は効かない
- **b**: this を持たない関数で扱うため、切り離す対象自体が存在しない

<!--
プロトタイプベースの動的 this への対策は2つあります。
a は class を使い続ける場合の基本パターン、アロー関数フィールドです。lexical this で固定することで、this を切り離されないようにします。ただし prototype に載らずインスタンスごとにコピーされ、decorator や AOP の対象外になる注意点があります。
b は class を使わずに関数として書くパターンです。this を持たない関数で扱うため、切り離す対象自体が存在しません。後半の「クラスがない世界」で改めて取り上げます。
ここまでで、3つの特性と、それぞれが引き起こす落とし穴・対策を一通り見ました。次は視点を変えて、これら対策に共通する構図を見ていきます。
-->

---
layout: section
---

# 3. クラスがない世界

トランスパイル時にも実行時にも参照できる「値」で全てを表現する

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

ここまでの3つの対策はすべてこの組み合わせ

</div>

</div>

<MessageBox>

TypeScript では関数も値であるように、<u>すべてを値として表現できる</u>

</MessageBox>

<!--
ここで一度ズームアウトします。実は、ここまで見てきた3つの対策はすべて「値」で出来ていました。
Java の世界では classloader が型のアイデンティティを実行時に保持し、リフレクションで型を問い合わせることができます。TypeScript ではそれが実行時に取れず、私たちはそれを「できないこと」と捉えがちです。
しかし TypeScript には別のアプローチがあります。関数も値であるように、すべてを値として表現できます。名前のアイデンティティは Branded Type、種別の判別は Discriminated Union、振る舞いは this を持たない関数。これらは実行時にも残る「値」です。
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
ここで重要なのは、これが「実行時の型情報がない」ことの直接的な結果だということです。型情報が実行時に消えるからこそ、契約はすべて静的に、シグニチャに書き切られている必要があります。これは制約のように見えますが、IDE 補完・型推論・grep だけで振る舞いを追える、という強力な静的読解性を実現します。
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
- class なら `new` で組み立てて、protected を public に開けて...という事前準備が要らない

<MessageBox>

class がなくても、<br/>**「値」だけで TypeScript は完結する**

</MessageBox>

<!--
シグニチャが契約だということは、テストにも大きな帰結があります。ダミー値はシグニチャを満たせば十分なので、コンストラクタもモックライブラリも要らない。
さらに Branded Type とスキーマライブラリを組み合わせれば、本番と同じ検証ロジックで作った値をテストにも持ち込めます。Zod の parse を通せば、テストで使う UserId も本番で使う UserId も、同じ「正しい値」です。
class ベースだとどうしても、new で組み立てたり、テストのために protected を public に開けたり、モックのインターフェースを定義したり、という事前準備が必要になります。値の世界ではそれがありません。
ここまで来ると、「クラスがない世界」とは、トランスパイル時にも実行時にも参照できる「値」だけで全てを表現する世界だ、ということが見えてきます。Branded Type も Discriminated Union も関数も、すべて値として残るからこそ TypeScript は class なしで完結します。
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

### class を書く側

Angular / NestJS / Web Components / TypeORM の他、  
Custom Error (`extends Error`) / `Symbol.dispose` (`using` 対応) も class が自然

- フィールド型に **Branded Type** を入れる
- decorator が要らないメソッドは**アロー関数フィールド**で lexical this に固定する
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
最後に立場ごとの戦略です。class を使うかどうかは、多くの場合フレームワークが決めます。Angular / NestJS / Web Components / TypeORM では class を書かざるを得ません。それ以外でも、Custom Error クラスや Symbol.dispose で using ライフサイクルを実装する場合は class が自然な選択です。
class を書く側は、フィールド型に Branded Type を入れる、decorator が要らないメソッドはアロー関数フィールドで lexical this に固定する、ドメインロジックは class の外に関数として切り出す。落とし穴を値で対処して、限定された範囲で class を扱います。
書かない側は、ID は Branded Type + スキーマ、種別は Discriminated Union、振る舞いは関数、テストはダミー値で。そしてフレームワーク選定の際に、その class 強制度を批評の材料として持っておく。
どちらの立場でも、基にある原理は同じ「値の世界」です。そこから戦術が分かれます。
-->

---

# 3つの持ち帰りポイント

<CardGrid :cols="3">
  <SummaryCard :number="1" title="歴史的必然" description="classの複雑さは ECMAScript との長期にわたる整合作業の結果" subdescription="設計ミスではなく、TypeScript と JavaScript の経緯から生まれたもの" />
  <SummaryCard :number="2" title="3つの特性" description="構造的部分型 / 型消去 / プロトタイプベース" subdescription="個別の落とし穴を暗記するより、この3つを理解する" />
  <SummaryCard :number="3" title="値で全てを表現する世界" description="Branded Type / Discriminated Union / 関数で、失われたものを値で取り戻せる" subdescription="トランスパイル時にも実行時にも参照できる「値」だけで完結する" />
</CardGrid>

<!--
持ち帰りポイントを3つにまとめます。
1つ目、classの複雑さは歴史的必然です。設計ミスではなく、TypeScript と JavaScript の重なりが生んだ形であり、その歴史を踏まえて付き合うべきものです。
2つ目、構造的部分型・型消去・プロトタイプベースという3つの特性を理解すれば、個別の落とし穴を暗記しなくても体系的に見えるようになります。
3つ目、Branded Type / Discriminated Union / 関数によって、class が持っていた「名前」「種別」「振る舞い」を値の世界で取り戻すことができます。「クラスがない世界」とは、トランスパイル時にも実行時にも参照できる「値」だけで全てを表現する世界です。立場ごとの戦術は違っても、基にある原理は同じです。class を書き続ける方も、避けてきた方も、この「値の世界」を共通の語彙として持ち帰っていただきたいと思います。
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
