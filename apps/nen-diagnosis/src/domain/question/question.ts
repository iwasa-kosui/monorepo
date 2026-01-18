import type { NenType } from '../nenType/nenType.ts';

export type Answer = Readonly<{
  id: string;
  text: string;
  scores: Partial<Record<NenType, number>>;
}>;

export type Question = Readonly<{
  id: number;
  title: string;
  text: string;
  answers: readonly Answer[];
}>;

export const QUESTIONS: readonly Question[] = [
  {
    id: 1,
    title: '行動のきっかけ',
    text: '目の前に「押してはいけない」と書かれた謎のボタンがあります。あなたならどうする？',
    answers: [
      { id: '1a', text: '何も考えずに押してみる', scores: { enhancement: 2 } },
      { id: '1b', text: '罠がないか周囲を慎重に調べてから、触らずに立ち去る', scores: { conjuration: 2 } },
      { id: '1c', text: '誰かに押させて、何が起こるか見て楽しむ', scores: { transmutation: 2 } },
      { id: '1d', text: '「押すな」という命令が気に食わないので、わざと押す', scores: { emission: 2 } },
    ],
  },
  {
    id: 2,
    title: '嘘について',
    text: '友人にサプライズを仕掛けるために嘘をつくことになりました。あなたの心境は？',
    answers: [
      { id: '2a', text: 'バレないかドキドキするし、嘘をつくのは苦手だ', scores: { enhancement: 2 } },
      { id: '2b', text: 'どう騙して驚かせてやろうかワクワクする', scores: { transmutation: 2 } },
      { id: '2c', text: '計画通りに進むか、細かい手順が気になって仕方ない', scores: { conjuration: 2 } },
      { id: '2d', text: '嘘をつくのは面倒くさいから、サプライズ自体あまりやりたくない', scores: { emission: 2 } },
    ],
  },
  {
    id: 3,
    title: '怒りのスイッチ',
    text: 'レストランで注文した料理が30分経っても来ません。店員を呼んだ時、どう伝える？',
    answers: [
      { id: '3a', text: '「まだですか！」と、イライラを隠さずに怒鳴る', scores: { emission: 2 } },
      { id: '3b', text: '「今の状況を説明してください」と理詰めで問い詰める', scores: { manipulation: 2 } },
      { id: '3c', text: '「お腹すいちゃったよ〜」と素直に伝えるか、我慢して待つ', scores: { enhancement: 2 } },
      { id: '3d', text: '無言で席を立つか、二度と来ないと思うだけ（顔には出さない）', scores: { specialization: 2 } },
    ],
  },
  {
    id: 4,
    title: 'ルールの遵守',
    text: '学校や会社の校則・規則についてどう思う？',
    answers: [
      { id: '4a', text: 'ルールは守るためにある。破るやつは許せない', scores: { conjuration: 2 } },
      { id: '4b', text: '納得できるルールなら守るが、納得できなければ自分のやり方を貫く', scores: { manipulation: 2 } },
      { id: '4c', text: 'ルールなんて関係ない。その場の気分で動く', scores: { transmutation: 2 } },
      { id: '4d', text: '自分がルールだ（あるいは、ルールを作る側に回りたい）', scores: { specialization: 2 } },
    ],
  },
  {
    id: 5,
    title: '休日の過ごし方',
    text: '楽しみにしていた休日、急に予定がなくなってしまいました。どうする？',
    answers: [
      { id: '5a', text: 'とりあえず外に出て、身体を動かしたり友達に連絡する', scores: { enhancement: 2 } },
      { id: '5b', text: '家で一人、趣味の世界に没頭したりコレクションを整理する', scores: { conjuration: 1, manipulation: 1 } },
      { id: '5c', text: '気分次第で、あてもなくふらふらと散歩する', scores: { transmutation: 2 } },
      { id: '5d', text: '大勢で騒ぎたいので、すぐに誰かを呼び出して飲み会を開く', scores: { emission: 2 } },
    ],
  },
  {
    id: 6,
    title: '議論・話し合い',
    text: '会議や話し合いの場で、あなたのスタンスは？',
    answers: [
      { id: '6a', text: '自分の意見を主張し、相手を論破しようとする', scores: { manipulation: 2 } },
      { id: '6b', text: '面倒なので早く終わってほしい。大筋が決まれば細かいことは気にしない', scores: { emission: 2 } },
      { id: '6c', text: '周囲の意見を聞きつつ、自分の立ち位置を有利な方に変える', scores: { transmutation: 2 } },
      { id: '6d', text: 'あまり発言しないが、最終的な決定権だけは持ちたい', scores: { specialization: 2 } },
    ],
  },
  {
    id: 7,
    title: '欲しい能力',
    text: 'もし一つだけ魔法が使えるなら、どれがいい？',
    answers: [
      { id: '7a', text: '世界最強のパワーで、誰にも負けない力が欲しい', scores: { enhancement: 2 } },
      { id: '7b', text: '誰にも縛られず、自由に空を飛んだり姿を消したりしたい', scores: { transmutation: 2 } },
      { id: '7c', text: '自分の思い通りに他人を動かせる力が欲しい', scores: { manipulation: 1, specialization: 1 } },
      { id: '7d', text: 'どんな危険からも身を守れる、絶対的な結界が欲しい', scores: { conjuration: 2 } },
    ],
  },
  {
    id: 8,
    title: '困難への対処',
    text: '大きな困難に直面したとき、あなたはどうする？',
    answers: [
      { id: '8a', text: '正面から立ち向かい、力で突破する', scores: { enhancement: 2 } },
      { id: '8b', text: '状況を分析し、最適な方法を計画する', scores: { conjuration: 1, manipulation: 1 } },
      { id: '8c', text: '柔軟に対応を変え、抜け道を探す', scores: { transmutation: 2 } },
      { id: '8d', text: '周囲の力を借りて、一気に解決する', scores: { emission: 2 } },
    ],
  },
  {
    id: 9,
    title: '人間関係',
    text: '初対面の人と話すとき、あなたは？',
    answers: [
      { id: '9a', text: 'オープンで気さくに話しかける', scores: { enhancement: 1, emission: 1 } },
      { id: '9b', text: '相手の反応を見ながら、自分のペースに巻き込む', scores: { transmutation: 2 } },
      { id: '9c', text: '相手の情報を聞き出し、戦略的に付き合い方を決める', scores: { manipulation: 2 } },
      { id: '9d', text: '自分から話しかけるのは苦手。でも興味がある人には惹かれる', scores: { conjuration: 1, specialization: 1 } },
    ],
  },
  {
    id: 10,
    title: '理想の生き方',
    text: 'あなたが最も大切にしている価値観は？',
    answers: [
      { id: '10a', text: '強さと成長。自分を高め続けること', scores: { enhancement: 2 } },
      { id: '10b', text: '自由と変化。型にはまらない生き方', scores: { transmutation: 2 } },
      { id: '10c', text: '情熱と行動。思い立ったら即実行', scores: { emission: 2 } },
      { id: '10d', text: '秩序と完成度。物事を正しく美しく', scores: { conjuration: 2 } },
    ],
  },
];

export const Question = {
  all: (): readonly Question[] => QUESTIONS,
  getById: (id: number): Question | undefined => QUESTIONS.find(q => q.id === id),
  count: (): number => QUESTIONS.length,
} as const;
