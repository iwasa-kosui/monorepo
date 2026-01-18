import type { DiagnosisResult } from '../../domain/diagnosis/diagnosis.ts';
import { NEN_TYPES, NenType } from '../../domain/nenType/nenType.ts';

type ResultCardProps = Readonly<{
  result: DiagnosisResult;
  onRestart: () => void;
}>;

const WaterDivinationAnimation = ({ nenType }: { nenType: NenType }) => {
  const info = NenType.getInfo(nenType);

  return (
    <div className="flex flex-col items-center mb-8">
      <div className="relative">
        <div
          className="w-32 h-40 rounded-b-full border-4 border-slate-400 bg-gradient-to-b from-blue-300/30 to-blue-500/50 nen-glow"
          style={{ color: info.color }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-4 h-4 rounded-full animate-pulse"
              style={{ backgroundColor: info.color }}
            />
          </div>
        </div>
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-36 h-4 bg-slate-500 rounded-t-lg" />
      </div>
      <p className="mt-4 text-slate-400 text-sm italic">
        {info.waterDivinationResult}
      </p>
    </div>
  );
};

const ScoreBar = ({ nenType, percentage }: { nenType: NenType; percentage: number }) => {
  const info = NenType.getInfo(nenType);

  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-20 text-right">
        <span className="text-sm text-slate-400">{info.japaneseName}</span>
      </div>
      <div className="flex-1 bg-slate-700 rounded-full h-4 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: info.color,
          }}
        />
      </div>
      <div className="w-12 text-right">
        <span className="text-sm text-slate-300">{percentage}%</span>
      </div>
    </div>
  );
};

export const ResultCard = ({ result, onRestart }: ResultCardProps) => {
  const primaryInfo = NenType.getInfo(result.primaryType);
  const secondaryInfo = result.secondaryType ? NenType.getInfo(result.secondaryType) : null;

  return (
    <div className="animate-fade-in">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 shadow-xl">
        <h2 className="text-2xl font-bold text-center text-white mb-8">
          診断結果
        </h2>

        <WaterDivinationAnimation nenType={result.primaryType} />

        <div className="text-center mb-8">
          <div className="mb-2">
            <span className="text-slate-400">あなたの念系統は...</span>
          </div>
          <h3
            className="text-4xl font-bold mb-2 nen-glow inline-block px-4 py-2 rounded-lg"
            style={{ color: primaryInfo.color }}
          >
            {primaryInfo.japaneseName}
          </h3>
          {secondaryInfo && (
            <p className="text-slate-400 mt-2">
              サブ系統: <span style={{ color: secondaryInfo.color }}>{secondaryInfo.japaneseName}</span>
            </p>
          )}
        </div>

        <div className="bg-slate-900/50 rounded-xl p-6 mb-8">
          <h4 className="text-lg font-semibold text-white mb-4">性格特性</h4>
          <p className="text-slate-300 leading-relaxed">
            {primaryInfo.personality}
          </p>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-6 mb-8">
          <h4 className="text-lg font-semibold text-white mb-4">能力の特徴</h4>
          <p className="text-slate-300 leading-relaxed">
            {primaryInfo.description}
          </p>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-6 mb-8">
          <h4 className="text-lg font-semibold text-white mb-4">系統別スコア</h4>
          <div className="mt-4">
            {NEN_TYPES.map((type) => (
              <ScoreBar
                key={type}
                nenType={type}
                percentage={result.percentages[type]}
              />
            ))}
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-6 mb-8">
          <h4 className="text-lg font-semibold text-white mb-4">相性</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-400 mb-2">相性の良い系統</p>
              <div className="flex flex-wrap gap-2">
                {primaryInfo.compatibleTypes.map((type) => {
                  const info = NenType.getInfo(type);
                  return (
                    <span
                      key={type}
                      className="px-3 py-1 rounded-full text-sm"
                      style={{ backgroundColor: `${info.color}30`, color: info.color }}
                    >
                      {info.japaneseName}
                    </span>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-400 mb-2">相性の悪い系統</p>
              <div className="flex flex-wrap gap-2">
                {primaryInfo.incompatibleTypes.map((type) => {
                  const info = NenType.getInfo(type);
                  return (
                    <span
                      key={type}
                      className="px-3 py-1 rounded-full text-sm bg-slate-700 text-slate-400"
                    >
                      {info.japaneseName}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onRestart}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600
            hover:from-purple-500 hover:to-pink-500
            text-white font-semibold transition-all duration-200
            shadow-lg hover:shadow-purple-500/25"
        >
          もう一度診断する
        </button>
      </div>
    </div>
  );
};
