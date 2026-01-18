type ProgressBarProps = Readonly<{
  current: number;
  total: number;
}>;

export const ProgressBar = ({ current, total }: ProgressBarProps) => {
  const percentage = Math.round((current / total) * 100);

  return (
    <div className="w-full mb-8">
      <div className="flex justify-between text-sm text-slate-400 mb-2">
        <span>質問 {current} / {total}</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2">
        <div
          className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
