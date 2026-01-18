type StartScreenProps = Readonly<{
  onStart: () => void;
}>;

export const StartScreen = ({ onStart }: StartScreenProps) => {
  return (
    <div className='text-center'>
      <div className='bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 shadow-xl'>
        <div className='mb-8'>
          <div className='w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center nen-glow'>
            <span className='text-4xl'>念</span>
          </div>
          <h1 className='text-3xl md:text-4xl font-bold text-white mb-4'>
            念系統診断
          </h1>
          <p className='text-slate-400 text-lg'>
            ヒソカのオーラ別性格分析
          </p>
        </div>

        <div className='mb-8 text-left bg-slate-900/50 rounded-xl p-6'>
          <h2 className='text-lg font-semibold text-white mb-4'>
            ヒソカの性格分析とは？
          </h2>
          <p className='text-slate-300 leading-relaxed mb-4'>
            天空闘技場でヒソカが披露した「オーラ別性格分析」に基づく診断です。
            念能力者の系統は性格と深い関係があるとされています。
          </p>

          <div className='space-y-2 text-sm mb-4'>
            <div className='flex items-center gap-2'>
              <span className='w-20 text-yellow-400'>強化系</span>
              <span className='text-slate-400'>→ 単純で一途</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='w-20 text-purple-400'>変化系</span>
              <span className='text-slate-400'>→ 気まぐれで嘘つき</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='w-20 text-red-400'>放出系</span>
              <span className='text-slate-400'>→ 短気で大雑把</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='w-20 text-blue-400'>操作系</span>
              <span className='text-slate-400'>→ 理屈っぽくマイペース</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='w-20 text-green-400'>具現化系</span>
              <span className='text-slate-400'>→ 神経質</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='w-20 text-pink-400'>特質系</span>
              <span className='text-slate-400'>→ 個人主義でカリスマ性</span>
            </div>
          </div>

          <p className='text-slate-500 text-xs'>
            全12問の質問に答えると、あなたの念系統が判定されます。 判定根拠も表示されるので、結果に納得できるはずです。
          </p>
        </div>

        <button
          onClick={onStart}
          className='w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600
            hover:from-purple-500 hover:to-pink-500
            text-white font-semibold text-lg transition-all duration-200
            shadow-lg hover:shadow-purple-500/25'
        >
          診断を開始する
        </button>
      </div>
    </div>
  );
};
