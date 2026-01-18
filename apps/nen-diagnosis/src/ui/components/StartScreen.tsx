type StartScreenProps = Readonly<{
  onStart: () => void;
}>;

export const StartScreen = ({ onStart }: StartScreenProps) => {
  return (
    <div className="text-center">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 shadow-xl">
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center nen-glow">
            <span className="text-4xl">念</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            念系統診断
          </h1>
          <p className="text-slate-400 text-lg">
            オーラ別性格診断
          </p>
        </div>

        <div className="mb-8 text-left bg-slate-900/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">水見式とは？</h2>
          <p className="text-slate-300 leading-relaxed mb-4">
            コップに水を入れ、その上に葉っぱを浮かべてオーラを注ぐと、
            念能力者の系統に応じて異なる反応が現れます。
          </p>
          <p className="text-slate-400 text-sm">
            この診断では、あなたの性格や行動パターンから念の系統を判定します。
            全10問の質問に答えてください。
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
          <div className="bg-yellow-500/20 rounded-lg p-3">
            <span className="text-yellow-400">強化系</span>
          </div>
          <div className="bg-purple-500/20 rounded-lg p-3">
            <span className="text-purple-400">変化系</span>
          </div>
          <div className="bg-red-500/20 rounded-lg p-3">
            <span className="text-red-400">放出系</span>
          </div>
          <div className="bg-blue-500/20 rounded-lg p-3">
            <span className="text-blue-400">操作系</span>
          </div>
          <div className="bg-green-500/20 rounded-lg p-3">
            <span className="text-green-400">具現化系</span>
          </div>
          <div className="bg-pink-500/20 rounded-lg p-3">
            <span className="text-pink-400">特質系</span>
          </div>
        </div>

        <button
          onClick={onStart}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600
            hover:from-purple-500 hover:to-pink-500
            text-white font-semibold text-lg transition-all duration-200
            shadow-lg hover:shadow-purple-500/25"
        >
          診断を開始する
        </button>
      </div>
    </div>
  );
};
