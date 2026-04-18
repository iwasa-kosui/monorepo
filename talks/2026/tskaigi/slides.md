---
theme: ../../themes/kkhs
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
  unlisted: true
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

# 本日の構成

1. **歴史篇** — TypeScriptとECMAScriptのclassの「追いかけっこ」
2. **落とし穴篇** — 4つの落とし穴がなぜ生まれるのか
3. **対策篇** — classと付き合う現実的な方法

<!--
本日は3部構成です。まず歴史篇でTypeScriptのclassがなぜ今の形になったかを追います。次に落とし穴篇で、開発者が遭遇する4つの落とし穴がなぜ生まれるのか、その仕組みを根本原因から整理します。最後に対策篇で、フレームワークがclassを要求する現実の中で、各落とし穴にどう対処するかを示します。
-->

---
layout: section
---

# 1. 歴史篇

TypeScriptとECMAScriptのclassの「追いかけっこ」

---

# なぜ歴史を知る必要があるのか

<MessageBox>

classの複雑さは「設計ミス」ではなく<br/>ECMAScriptとの歴史的必然から生まれた

</MessageBox>

- TypeScriptが**ES6より3年先に**classを実装した
- 後からECMAScriptの仕様が決まり、両者を統合する旅が始まった
- この歴史を知ることで、今の仕様の「なぜ」が見えてくる

<!--
なぜわざわざ歴史を知る必要があるのでしょうか。TypeScriptのclassの複雑さは、誰かの設計ミスではありません。TypeScriptがECMAScriptより先にclassを実装し、後から標準仕様が決まったことで、両者を統合する長い旅が始まりました。この歴史を知ることで、「なぜこうなっているのか」が腹落ちします。
-->

---

# ES4の挫折 (2008)

### 野心的すぎた仕様

- ES3策定後、TC39はclass宣言・強い型付け・namespaceを含む**ES4**の策定に着手
- Mozilla/Adobe/Opera陣営が推進
- Microsoftが**後方互換性の破壊**と**言語の複雑化**を理由に強硬に反対

### 結果

- 2008年にES4は**正式に廃棄**
- 代わりに**Harmony**プロセスが発足
- ES5では控えめな改善にとどめ、class構文は次世代へ持ち越し

<!--
classの歴史は、実はES4の挫折から始まります。ES3の後、TC39はclass宣言や強い型付けを含む野心的なES4を策定しようとしました。しかしMicrosoftが後方互換性の破壊を理由に強硬に反対し、2008年に廃棄されました。ここでclass構文は一度お蔵入りになり、Harmonyプロセスで仕切り直しとなります。
-->

---

# ES2015: maximally minimal classes

<InsightCard title="全員が合意できる最小限の設計">
  <p>Allen Wirfs-Brock（Microsoft）が中心的に推進</p>
  <p>private・static fields・decoratorsは<span class="highlight">すべて後回し</span></p>
</InsightCard>

### ES2015 classの本質

- 内部的にはprototypeチェーンそのもの（シンタックスシュガー）
- `typeof MyClass` は `'function'`
- `new`なしの呼び出しはTypeError
- 組み込みコンストラクタ（`Array`, `Error`）のサブクラス化が可能に

<!--
ES4の失敗を教訓に、ES2015ではmaximally minimal classesというアプローチが採用されました。全TC39メンバーが合意できる最小限の設計です。privateフィールド、staticフィールド、decoratorsといった高度な機能はすべて後回しにされました。
重要なのは、ES2015のclassは内部的にはprototypeチェーンそのものだということです。シンタックスシュガーと呼ばれる所以ですが、newなしで呼べないなどの差異もあります。
-->

---

# TypeScript誕生とclassの先行実装 (2012)

### ES6より3年早いclass

- 2012年: TypeScript 0.8が**ES2015より3年先に**classをサポート
- 設計者Anders Hejlsberg（C#の設計者）の影響で`public`/`private`/`protected`を初版から搭載
- コンパイル時にES5互換のprototypeベースコードに変換

```typescript
// TypeScript (2012)
class Greeter {
  private name: string;
  constructor(name: string) { this.name = name; }
  greet() { return `Hello, ${this.name}`; }
}
```

```javascript
// ES5出力
var Greeter = (function () {
  function Greeter(name) { this.name = name; }
  Greeter.prototype.greet = function () { return "Hello, " + this.name; };
  return Greeter;
})();
```

<!--
2012年、TypeScript 0.8がリリースされます。ES2015より3年も先にclass構文をサポートしました。設計者のAnders HejlsbergはC#の設計者でもあり、public/private/protectedといったアクセス修飾子を初版から備えていました。
コンパイル時にはES5互換のprototypeベースのコードに変換されます。この先行実装は大きな恩恵をもたらしましたが、同時に後の互換性課題の種にもなりました。
-->

---

# `[[Define]]` vs `[[Set]]` 論争

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

`useDefineForClassFields` フラグで切り替え。`target: ES2022`以上ではデフォルトで`true`

<!--
TypeScriptが先行実装したクラスフィールドは、代入に相当するSetセマンティクスでした。しかしTC39はObject.definePropertyに相当するDefineセマンティクスを採用しました。
違いはスーパークラスにsetterがある場合に顕著です。Setではsetterが呼ばれますが、Defineではバイパスされます。この食い違いはMobXやTypeORMなどのフレームワークに破壊的影響を与えました。
TypeScript 3.7でuseDefineForClassFieldsフラグが導入され、ES2022以上ではデフォルトでDefine（ES標準準拠）になります。仕様より早く実装することの「コスト」を示す教訓です。
-->

---

# デコレーターの10年の旅

<div class="grid grid-cols-[1fr_1fr] gap-6">

<div>

### 2014-2015: Legacy Decorators

- Yehuda Katzが2014年にTC39に提案
- TypeScript 1.5が`--experimentalDecorators`で実装
- Angular, NestJS, MobXが依存

```typescript
// Legacy: (target, name, descriptor) 形式
function Log(target: any, key: string,
  desc: PropertyDescriptor) {
  // ...
}
```

</div>

<div>

### 2022-2023: Stage 3 Decorators

- 2022年3月にStage 3到達
- TypeScript 5.0（2023年）でサポート
- Legacy decoratorsとは**互換性なし**

```typescript
// Stage 3: (value, context) 形式
function Log(value: Function,
  context: ClassMethodDecoratorContext) {
  // ...
}
```

</div>

</div>

<div class="mt-4 p-3 bg-slate-100 rounded text-sm">

`--experimentalDecorators`は後方互換のため存続。フラグなしでは新仕様が適用される

</div>

<!--
デコレーターの標準化には10年かかりました。2014年にYehuda KatzがTC39に提案し、翌年TypeScript 1.5がexperimentalDecoratorsフラグで実装しました。AngularやNestJSがこのlegacy decoratorsに大きく依存しています。
しかし2022年にStage 3に到達した新仕様はlegacyと互換性がありません。APIが全く異なります。TypeScript 5.0で新仕様がサポートされましたが、既存のフレームワークとの共存が続いています。
-->

---

# 年表

<div class="transform scale-80 origin-top-left">

| 年 | 出来事 |
|------|--------|
| 1999 | ES3策定。コンストラクタ関数 + prototypeパターンが標準に |
| 2008 | ES4廃棄。Harmonyプロセス発足 |
| 2012 | **TypeScript 0.8公開。ES6より3年早くclassをサポート** |
| 2014 | Decorators proposalがTC39に初提出 |
| 2015 | ES2015策定。maximally minimalなclass構文が標準化 |
| 2015 | TypeScript 1.5が`--experimentalDecorators`を実装 |
| 2019 | React 16.8がHooksを導入。class→function移行の始まり |
| 2020 | TypeScript 3.8がECMAScript `#` private fieldsをサポート |
| 2022 | **ES2022でprivate fields・static fields・static blocksが標準化** |
| 2023 | **TypeScript 5.0がStage 3 decoratorsをサポート** |

</div>

<!--
ここで年表を見て全体像を俯瞰しましょう。1999年のES3から2023年のTypeScript 5.0まで、約25年の歴史です。
太字の部分に注目してください。2012年にTypeScriptがES6より3年先にclassを実装し、2022年にようやくES2022でprivate fieldsが標準化され、2023年にdecoratorがTypeScriptでサポートされました。TypeScriptとECMAScriptの追いかけっこが、この年表から読み取れます。
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

# 2. 落とし穴篇

4つの落とし穴はなぜ生まれるのか

---
layout: center
---

# 2つの根本原因

<CardGrid :cols="2">
  <Card title="構造的部分型" description="型の互換性は名前ではなく構造で決まる" />
  <Card title="型消去" description="TypeScriptの型情報は実行時に消える" />
</CardGrid>

<div class="mt-8 text-center">

これから紹介する**4つの落とし穴**は  
すべてこの2つの根本原因に帰着する

</div>

<!--
落とし穴篇に入る前に、根本原因を2つ提示します。構造的部分型と型消去です。
構造的部分型とは、型の互換性が名前ではなく構造で決まる仕組みです。型消去とは、TypeScriptの型情報がトランスパイル時に消え、実行時には存在しないことです。
これから紹介する4つの落とし穴は、突き詰めるとすべてこの2つに帰着します。
-->

---

# 落とし穴1: 構造的部分型

### UserとProductが同じ型？

```typescript
class User {
  id: string;
  name: string;
  constructor(id: string, name: string) { this.id = id; this.name = name; }
}

class Product {
  id: string;
  name: string;
  constructor(id: string, name: string) { this.id = id; this.name = name; }
}

const sortByUserId = (users: ReadonlyArray<User>): ReadonlyArray<User> =>
  [...users].sort((a, b) => a.id.localeCompare(b.id));

sortByUserId([new User("1", "田中"), new Product("2", "商品A")]); // エラーなし!
```

JavaやC#ではクラス名が異なれば別の型だが、TypeScriptでは**構造が同じなら互換**

<!--
1つ目の落とし穴、構造的部分型です。UserクラスとProductクラスは名前が違いますが、idとnameという同じ構造を持っています。JavaやC#ではクラス名が異なれば別の型ですが、TypeScriptでは構造が同じなら型として互換性があります。
sortByUserIdという関数にProductを渡してもエラーになりません。UserIdとOrderIdが相互に代入できてしまう、といった問題も同様の原因で起きます。
-->

---

# なぜ構造的部分型なのか

### TypeScriptの設計目標

TypeScriptは**既存のJavaScriptコードとの互換性**を最優先に設計された

- JavaScriptにはクラスの「名前」で型を区別する仕組みがそもそも存在しない
- `{ id: string, name: string }` を満たすオブジェクトは、どう作られたかに関係なく同じように扱える — これがJavaScriptの柔軟性の源泉
- TypeScriptがこの柔軟性を壊すと、既存JSコードベースへの段階的導入が不可能になる

### Javaとの根本的な違い

- **Java**: クラスローダーが型のアイデンティティを管理。名前が違えば別の型
- **TypeScript**: 実行時に型情報は存在しない。構造で判断するしかない

<!--
なぜTypeScriptは構造的部分型を採用したのでしょうか。TypeScriptの設計目標は既存のJavaScriptコードとの互換性です。
JavaScriptにはそもそもクラスの名前で型を区別する仕組みがありません。あるプロパティを持つオブジェクトは、classで作ろうがオブジェクトリテラルで作ろうが同じように使える。これがJavaScriptの柔軟性です。
TypeScriptがもし名前的型付けを採用すると、この柔軟性が壊れ、既存のJSコードベースへの段階的導入ができなくなります。構造的部分型は互換性のための必然的な選択なのです。
-->

---

# 落とし穴2: thisバインディング

### メソッドをコールバックに渡すとthisが消失

```typescript
class Uploader {
  private storage = "/tmp";
  upload(fileName: string) {
    console.log(`Uploading ${fileName} to ${this.storage}...`);
  }
}

const uploader = new Uploader();
const api = {
  execute: (callback: (fileName: string) => void) => callback("document.pdf")
};

api.execute(uploader.upload);
// TypeError: Cannot read properties of undefined (reading 'storage')
```

JavaやC#では`this`はインスタンスに固定されるが、  
JavaScriptでは**呼び出し方によって`this`が変わる**

<!--
2つ目の落とし穴、thisバインディングです。Uploaderクラスのuploadメソッドをコールバックとして渡すと、thisがundefinedになりTypeErrorが発生します。
JavaやC#ではthisはインスタンスに固定されますが、JavaScriptではメソッドの呼び出し方によってthisが変わります。
-->

---

# なぜthisは動的に束縛されるのか

### prototypeベースOOPの仕組み

JavaScriptのメソッド呼び出しは、内部的に2つのステップで動作する

```javascript
// obj.method(arg) は内部的に以下と等価
const fn = obj.method;  // 1. プロパティを参照して関数オブジェクトを取得
fn.call(obj, arg);      // 2. thisをobjに設定して呼び出す
```

変数に代入したりコールバックとして渡すと、**ステップ1だけが実行されてthisが切り離される**

### classはこの仕組みの上に載っている

- ES2015のclassはprototypeチェーンのシンタックスシュガー
- メソッドは`Class.prototype`に定義される関数オブジェクト
- `this`の動的束縛はprototypeの根本的な仕様であり、classが隠しているだけ

<!--
なぜthisは動的に束縛されるのでしょうか。JavaScriptのメソッド呼び出しは内部的に2ステップで動作します。まずプロパティを参照して関数オブジェクトを取得し、次にthisを設定して呼び出す。変数に代入すると1ステップ目だけが実行され、thisが切り離されます。
ES2015のclassはprototypeチェーンのシンタックスシュガーなので、この動的束縛の仕組みがそのまま適用されます。classの見た目がJava風でも、中身はprototypeベースのオブジェクト指向です。
-->

---

# 落とし穴3: private修飾子と型消去

### TypeScriptの`private`は型レベルのみ

```typescript
class Account {
  private balance: number = 10000;
}

const myAccount = new Account();
// myAccount.balance; // コンパイルエラー

// しかし実行時には...
const untypedAccount: any = myAccount;
console.log(untypedAccount.balance); // 10000 — アクセスできてしまう!
```

TypeScriptの`private`はコンパイル時の型検査でのみ有効  
トランスパイル後のJavaScriptには**何の保護も残らない**

<!--
3つ目の落とし穴、private修飾子です。TypeScriptのprivateは型レベルのみの制約で、anyキャストやブラケット記法で簡単に回避できます。
トランスパイル後のJavaScriptにはprivateの痕跡すら残りません。JavaやC#のprivateとは根本的に異なります。
-->

---

# なぜprivateは実行時に効かないのか

### 型消去の仕組み

TypeScriptのトランスパイルは**型アノテーションを除去するだけ**

```typescript
// TypeScript
class Account {
  private balance: number = 10000;
}
```

```javascript
// トランスパイル後のJavaScript — privateの痕跡なし
class Account {
  balance = 10000;
}
```

### 歴史的経緯

- TypeScriptが`private`を実装した2012年時点では、JavaScriptに実行時プライバシーの仕組みが**存在しなかった**
- ES2022で`#`プライベートフィールドが標準化されるまで10年かかった
- TypeScriptの`private`はその間の「型レベルの近似」だった

<!--
なぜprivateが実行時に効かないのか。TypeScriptのトランスパイルは型アノテーションを除去するだけで、privateキーワードも一緒に消えます。
歴史的に見ると、TypeScriptがprivateを実装した2012年時点ではJavaScriptに実行時プライバシーの仕組み自体が存在しませんでした。ES2022でシャープprivateが標準化されるまで10年。TypeScriptのprivateはその間の「型レベルの近似」だったのです。
-->

---

# 落とし穴4: instanceofと型消去

### interfaceに対する`instanceof`は使えない

```typescript
interface Drawable {
  draw(): void;
}

class Circle implements Drawable {
  draw() { /* ... */ }
}

function render(item: Drawable) {
  if (item instanceof Drawable) {
    // Error: 'Drawable' only refers to a type, but is being used as a value here
  }
}
```

TypeScriptの`interface`は**トランスパイル時に消去**されるため  
実行時に`instanceof`の対象として使えない

<!--
4つ目の落とし穴、instanceofです。interfaceに対してinstanceofを使おうとすると、コンパイルエラーになります。Drawableはトランスパイル時に消去されるため、実行時には存在しません。
JavaやC#ではinterfaceに対するinstanceofチェックが可能ですが、TypeScriptではそもそも不可能です。
-->

---

# なぜinterfaceは実行時に消えるのか

### TypeScriptの設計原則: ランタイムへの影響を最小化

- TypeScriptは「JavaScriptに型を追加する」言語であり、**新しいランタイム構造を導入しない**ことを原則としている
- `interface`や`type`は純粋にコンパイル時の概念で、対応するJavaScript出力が存在しない
- `enum`や`namespace`はこの原則の例外であり、TypeScriptチームも後悔を表明している

### `instanceof`が機能する条件

`instanceof`はprototypeチェーンを辿って判定する実行時の演算子

- **classに対して使える**: classはprototypeに痕跡が残るため
- **interfaceに対して使えない**: interfaceはトランスパイルで消えるため
- **構造的部分型と組み合わさると**: classに対する`instanceof`も期待通り動かないケースがある

<!--
なぜinterfaceは消えるのか。TypeScriptは「JavaScriptに型を追加する」言語であり、新しいランタイム構造を導入しないことを原則としています。interfaceやtypeは純粋にコンパイル時の概念で、JavaScript出力には何も残りません。
instanceofはprototypeチェーンを辿る実行時の演算子なので、classに対しては使えますがinterfaceには使えません。さらに構造的部分型と組み合わさると、classに対するinstanceofも期待通り動かないケースがあります。
-->

---
layout: section
---

# 3. 対策篇

classと付き合う現実的な方法

---

# フレームワークとclassの現実

classを使うかどうかは、多くの場合**自分で選べない**

<div class="transform scale-80 origin-top-left">

| フレームワーク | classの位置づけ |
|--------------|----------------|
| **Angular** | class + decoratorが設計の基盤 |
| **NestJS** | class + decoratorが必須 |
| **Web Components** | `class extends HTMLElement`が仕様上必須 |
| **React** | classコンポーネントはLegacy。Error Boundaryのみclass必要 |
| **Vue 3** | `vue-class-component`は2023年にdeprecated |
| **Hono / Elysia** | 関数ベース。class不使用 |

</div>

フレームワークがclassを要求する以上、**落とし穴を知った上で付き合う**しかない

<!--
対策篇に入ります。classを使うかどうかは、多くの場合フレームワークが決めます。AngularやNestJSではclassとdecoratorが設計の基盤です。Web Componentsもclass extends HTMLElementが仕様上必須です。
一方でReactやVueは関数的アプローチに移行し、HonoやElysiaは最初からclass不使用です。
フレームワークがclassを要求する以上、落とし穴を知った上で付き合うしかありません。ここからは各落とし穴への具体的な対処法を示します。
-->

---

# 対策1: 構造的部分型 → Branded Types

### Symbolベースのブランド付与で型を区別

```typescript
type Brand<K, T extends symbol> = K & { [k in T]: true };

const UserIdSymbol = Symbol();
type UserId = Brand<string, typeof UserIdSymbol>;

const ProductIdSymbol = Symbol();
type ProductId = Brand<string, typeof ProductIdSymbol>;

type User = Readonly<{ id: UserId; name: string }>;
type Product = Readonly<{ id: ProductId; name: string }>;

sortByUserId([user]);    // OK
sortByUserId([product]); // 型エラー!
```

classを使い続ける場合でも、**IDなどの値オブジェクトをBranded Typeにする**だけで  
構造的部分型による取り違えを防げる

<!--
落とし穴1、構造的部分型への対策です。Branded Typesを使い、Symbolで型にブランドを付与することで、構造が同じでも異なる型として扱えます。
classを使い続ける場合でも、IDなどの値オブジェクトをBranded Typeにするだけで取り違えを防げます。NestJSのエンティティでもプロパティの型をBranded Typeにすれば効果があります。
-->

---

# 対策1: Zodスキーマとの組み合わせ

### バリデーションとブランド付与を一体化

```typescript
import { z } from "zod";

const userIdSym = Symbol();
const UserId = z.uuid().brand(userIdSym);
type UserId = z.infer<typeof UserId>;

const productIdSym = Symbol();
const ProductId = z.uuid().brand(productIdSym);
type ProductId = z.infer<typeof ProductId>;

const user = User.parse({ id: randomUUID(), name: "田中" });
const product = Product.parse({ id: randomUUID(), name: "商品A" });

sortByUserId([user]);    // OK
sortByUserId([product]); // 型エラー!
```

Zodの`.brand()`で**バリデーションとブランド付与を同時に実現**

<!--
さらに実践的なパターンとして、Zodのbrandメソッドを使う方法があります。バリデーションとブランド付与を一体化できるため、ランタイムの型安全性とコンパイル時の型安全性を同時に得られます。
外部入力のバリデーションにZodを使っているプロジェクトなら、ブランド付与を追加するだけで導入できます。
-->

---

# 対策2: thisバインディング

<CardGrid :cols="2">
  <OptionCard title="アロー関数フィールド" status="selected" statusText="class内で対処">
    <p>thisを語彙的に束縛</p>
    <p class="mt-2 text-xs">注意: prototypeに載らない<br/>インスタンスごとにコピーされる</p>
  </OptionCard>
  <OptionCard title="コンパニオンオブジェクト" status="selected" statusText="classから離脱">
    <p>データと振る舞いを分離</p>
    <p class="mt-2 text-xs">thisが存在しないため<br/>問題が根本的に発生しない</p>
  </OptionCard>
</CardGrid>

```typescript
// アロー関数フィールド — classを使い続ける場合
class Uploader {
  private storage = "/tmp";
  upload = (fileName: string) => {  // アロー関数
    console.log(`Uploading ${fileName} to ${this.storage}...`);
  };
}

// コンパニオンオブジェクト — classから離れる場合
type Uploader = Readonly<{ storage: string }>;
const Uploader = {
  new: (storage: string): Uploader => ({ storage }),
  upload: (u: Uploader) => (fileName: string): void => {
    console.log(`Uploading ${fileName} to ${u.storage}...`);
  },
} as const;
```

<!--
落とし穴2、thisバインディングへの対策は2つの方向があります。classを使い続ける場合はアロー関数フィールドでthisを語彙的に束縛します。ただしprototypeに載らないためインスタンスごとにコピーされる点は注意が必要です。
classから離れてよい場合はコンパニオンオブジェクトパターンです。データと振る舞いを分離し、thisが存在しないため問題が根本的に発生しません。
-->

---

# 対策3: private修飾子 → ES `#private`

### 実行時にも強制されるハードプライバシー

```typescript
class Account {
  #balance: number = 10000;

  getBalance() { return this.#balance; }
}

const myAccount = new Account();
console.log(myAccount.getBalance()); // 10000
// myAccount.#balance; // SyntaxError — 実行時にもアクセス不可
```

<div class="mt-4 transform scale-80 origin-top-left">

| | TS `private` | ES `#private` |
|---|---|---|
| コンパイル時の保護 | あり | あり |
| 実行時の保護 | **なし** | **あり** |
| `any`キャストで突破 | できる | **できない** |
| `Reflect.ownKeys()`で発見 | できる | **できない** |

</div>

<!--
落とし穴3への対策は、ECMAScriptのシャープprivateフィールドです。TS 3.8からサポートされています。
TSのprivateはanyキャストで突破でき、Reflect.ownKeysで発見できます。一方ESのシャープprivateは実行時にもアクセスできず、Reflect.ownKeysでも不可視です。
ライブラリやSDKなど外部に公開するコードでは、ESのシャープprivateが安全です。アプリケーション内部のコードではTSのprivateで十分な場合もあります。
-->

---

# 対策4: instanceof → Discriminated Union

### タグフィールドで安全に型を判別

```typescript
type Circle = Readonly<{ kind: "circle"; radius: number }>;
type Square = Readonly<{ kind: "square"; sideLength: number }>;
type Triangle = Readonly<{ kind: "triangle"; base: number; height: number }>;
type Shape = Circle | Square | Triangle;

const getArea = (shape: Shape): number => {
  switch (shape.kind) {
    case "circle":   return Math.PI * shape.radius ** 2;
    case "square":   return shape.sideLength ** 2;
    case "triangle": return (shape.base * shape.height) / 2;
    default: {
      const _exhaustiveCheck: never = shape;
      return _exhaustiveCheck;
    }
  }
};
```

`kind`フィールドは実行時にも存在する → `instanceof`不要で**網羅性チェック**も得られる

<!--
落とし穴4への対策は、Discriminated Unionです。kindフィールドというタグを持たせることで、switch文で安全に型を判別できます。
default節のnever型による網羅性チェックがポイントです。新しいShapeを追加したときにcase文を書き忘れるとコンパイルエラーになります。instanceofでは得られない安全性です。
kindフィールドは実行時にも存在するため、型消去の影響を受けません。
-->

---
layout: section
---

# まとめ

---

# 2つの持ち帰りポイント

<CardGrid :cols="2">
  <SummaryCard :number="1" title="歴史的必然" description="classの複雑さはECMAScriptとの「追いかけっこ」の産物" subdescription="設計ミスではない" />
  <SummaryCard :number="2" title="2つの根本原因" description="構造的部分型と型消去を理解すれば落とし穴が体系的に見える" subdescription="個別暗記ではなく原理の理解" />
</CardGrid>

<!--
持ち帰りポイントを2つにまとめます。
1つ目、classの複雑さは歴史的必然です。ECMAScriptとの追いかけっこの産物であり、設計ミスではありません。
2つ目、構造的部分型と型消去という2つの根本原因を理解すれば、落とし穴が体系的に見えるようになります。
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
