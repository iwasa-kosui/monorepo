type ModeCard = {
  id: "solo" | "party";
  label: string;
  tagline: string;
  description: string;
  highlights: string[];
};

type QuickFact = {
  label: string;
  value: string;
  detail: string;
};

type FlowStep = {
  step: string;
  title: string;
  description: string;
};

const modes: ModeCard[] = [
  {
    id: "solo",
    label: "ひとりで練習",
    tagline: "3分スコアアタック",
    description:
      "テンポの良いBGMとタイマーで集中力を高めながら、辞書判定でひとりでも本番さながらに腕試し。",
    highlights: ["制限時間 180 秒", "1ターン 10 秒判定", "辞書で自動チェック"],
  },
  {
    id: "party",
    label: "みんなで対戦",
    tagline: "2〜4人ホットシート",
    description:
      "1台のデバイスを回して遊ぶパーティーモード。ラウンドごとにプレイヤーが交代し、スコアを競います。",
    highlights: ["2〜4人でプレイ", "ターン制ラウンド", "順位結果を表示"],
  },
];

const quickFacts: QuickFact[] = [
  {
    label: "制限時間",
    value: "10 秒",
    detail: "1ターンごとにビジュアルタイマーが減少。",
  },
  {
    label: "得点ルール",
    value: "文字数 = 点数",
    detail: "3文字以上で成立、長い単語ほど高得点。",
  },
  {
    label: "判定条件",
    value: "4 つ",
    detail: "あたま/おしり・辞書一致・3文字以上。",
  },
];

const flowSteps: FlowStep[] = [
  {
    step: "STEP 1",
    title: "お題の文字が決定",
    description:
      "「あたま」と「おしり」のひらがながランダムに表示され、盤面が彩られます。",
  },
  {
    step: "STEP 2",
    title: "タイマーとBGMが始動",
    description:
      "リズミカルなサウンドと10秒バーで緊張感を演出。思いついた単語をすぐ入力。",
  },
  {
    step: "STEP 3",
    title: "判定 & スコア集計",
    description:
      "辞書データで即判定し、OKなら文字数分のポイント。結果ポップアップで次のターンへ。",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(248,197,109,0.35),_transparent_55%)]" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-8 lg:gap-12 lg:py-16">
        <header className="space-y-4 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-amber-300">
            Webブラウザ版 モジサンド
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl sm:leading-tight">
            言葉をサンドして盛り上がる
            <span className="text-amber-300"> パーティーゲーム</span>
          </h1>
          <p className="text-base leading-relaxed text-slate-200 sm:text-lg">
            TVで人気の「言葉をサンドする」遊びを、ブラウザでそのまま再現。モードを選んでスタートするだけで、
            すぐにテンションが上がるタイトル画面です。
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_60px_rgba(251,191,36,0.25)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.3em] text-amber-200">
                  GAME MODE
                </p>
                <h2 className="mt-2 text-2xl font-semibold">モードを選んでスタート</h2>
              </div>
              <div className="rounded-full border border-white/30 px-3 py-1 text-xs text-slate-100">
                即プレイ可能
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-label={`${mode.label}を開始`}
                  className="group h-full rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-left transition hover:border-amber-200 hover:bg-slate-900/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">
                    {mode.tagline}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{mode.label}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-200">
                    {mode.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200">
                    {mode.highlights.map((highlight) => (
                      <span
                        key={highlight}
                        className="rounded-full border border-white/20 px-3 py-1"
                      >
                        {highlight}
                      </span>
                    ))}
                  </div>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-amber-200">
                    今すぐスタート
                    <svg
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
                      viewBox="0 0 14 14"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden
                    >
                      <path
                        d="M2 7h10M7 2l5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs font-semibold tracking-[0.4em] text-amber-200">
                ODAI SAMPLE
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-2xl bg-slate-900/70 p-4">
                  <p className="text-xs tracking-[0.4em] text-slate-300">あたま</p>
                  <p className="mt-2 text-4xl font-semibold">き</p>
                </div>
                <div className="rounded-2xl bg-slate-900/70 p-4">
                  <p className="text-xs tracking-[0.4em] text-slate-300">おしり</p>
                  <p className="mt-2 text-4xl font-semibold">り</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-200">
                例: 「きらり」「きつねざわり」など、3文字以上でスコアゲット。
              </p>
              <div className="mt-3 rounded-2xl bg-amber-300/15 p-3 text-xs text-amber-100">
                辞書判定: 登録された有効単語であれば自動でOK。
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs font-semibold tracking-[0.4em] text-amber-200">
                QUICK FACTS
              </p>
              <div className="mt-4 grid gap-3">
                {quickFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-start justify-between gap-4 rounded-2xl bg-slate-900/60 p-4"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                        {fact.label}
                      </p>
                      <p className="mt-1 text-lg font-semibold">{fact.value}</p>
                    </div>
                    <p className="max-w-[180px] text-xs text-slate-300">{fact.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.35em] text-amber-200">
                GAME FLOW
              </p>
              <h2 className="mt-2 text-2xl font-semibold">ゲームの進み方</h2>
              <p className="mt-2 text-sm text-slate-200">
                タイトル画面では進行が一目で分かるよう、各ステップをガイド表示。
              </p>
            </div>
            <div className="rounded-full border border-white/20 px-4 py-2 text-xs text-slate-200">
              BGM On / Off 切り替えもここから
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {flowSteps.map((flow) => (
              <div
                key={flow.step}
                className="rounded-2xl border border-white/10 bg-slate-950/40 p-5"
              >
                <p className="text-xs font-semibold tracking-[0.35em] text-slate-400">
                  {flow.step}
                </p>
                <p className="mt-2 text-lg font-semibold">{flow.title}</p>
                <p className="mt-2 text-sm text-slate-200">{flow.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
