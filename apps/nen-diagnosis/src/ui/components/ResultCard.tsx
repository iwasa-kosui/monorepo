import { useCallback, useState } from 'react';

import type { DiagnosisResult } from '../../domain/diagnosis/diagnosis.ts';
import {
  AXIS_CONTRIBUTIONS,
  AXIS_INFO,
  JUDGMENT_AXES,
  type JudgmentAxis,
} from '../../domain/judgmentAxis/judgmentAxis.ts';
import { NEN_TYPES, NenType } from '../../domain/nenType/nenType.ts';

const ShareButton = ({ result }: { result: DiagnosisResult }) => {
  const [copied, setCopied] = useState(false);
  const primaryInfo = NenType.getInfo(result.primaryType);

  const shareText = `念系統診断の結果は「${primaryInfo.japaneseName}」でした！\n${
    primaryInfo.personality.slice(0, 50)
  }...`;
  const shareUrl = window.location.href;

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: '念系統診断',
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // ユーザーがキャンセルした場合など
      }
    } else {
      // Web Share API非対応の場合はクリップボードにコピー
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // クリップボードAPIも使えない場合
      }
    }
  }, [shareText, shareUrl]);

  const handleTwitterShare = useCallback(() => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${
      encodeURIComponent(shareUrl)
    }`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  }, [shareText, shareUrl]);

  return (
    <div className='flex gap-3 mb-4'>
      <button
        onClick={handleShare}
        className='flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600
          text-white font-medium transition-all duration-200
          flex items-center justify-center gap-2'
      >
        {copied
          ? (
            'コピーしました!'
          )
          : (
            <>
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z'
                />
              </svg>
              シェア
            </>
          )}
      </button>
      <button
        onClick={handleTwitterShare}
        className='py-3 px-4 rounded-xl bg-[#1DA1F2] hover:bg-[#1a8cd8]
          text-white font-medium transition-all duration-200
          flex items-center justify-center'
        aria-label='Xでシェア'
      >
        <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
          <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
        </svg>
      </button>
    </div>
  );
};

type ResultCardProps = Readonly<{
  result: DiagnosisResult;
  onRestart: () => void;
}>;

const WaterDivinationAnimation = ({ nenType }: { nenType: NenType }) => {
  const info = NenType.getInfo(nenType);

  // 各念タイプに応じたアニメーションスタイル
  const getWaterStyle = () => {
    switch (nenType) {
      case 'enhancement':
        return { animation: 'water-overflow 2s ease-in-out infinite' };
      case 'transmutation':
        return { animation: 'water-wave 3s ease-in-out infinite' };
      case 'emission':
        return { animation: 'color-shift 2s ease-in-out infinite' };
      case 'specialization':
        return { animation: 'special-pulse 3s ease-in-out infinite' };
      default:
        return {};
    }
  };

  return (
    <div className='flex flex-col items-center mb-8'>
      {/* コップ本体 */}
      <div className='relative' style={{ color: info.color }}>
        {/* コップの形状 - ワイングラス風 */}
        <svg width='140' height='160' viewBox='0 0 140 160' className='drop-shadow-lg'>
          {/* コップ本体（台形） */}
          <path
            d='M30 20 L25 110 Q25 125 70 125 Q115 125 115 110 L110 20 Z'
            fill='rgba(200, 220, 255, 0.15)'
            stroke='rgba(255,255,255,0.4)'
            strokeWidth='2'
          />

          {/* 水 */}
          <clipPath id='cupClip'>
            <path d='M32 25 L28 105 Q28 118 70 118 Q112 118 112 105 L108 25 Z' />
          </clipPath>

          <g clipPath='url(#cupClip)'>
            {/* 水の本体 */}
            <rect
              x='28'
              y='35'
              width='84'
              height='85'
              fill='rgba(100, 180, 255, 0.5)'
              style={getWaterStyle()}
            />

            {/* 水面のハイライト */}
            <ellipse
              cx='70'
              cy='38'
              rx='38'
              ry='6'
              fill='rgba(255,255,255,0.3)'
              style={nenType === 'transmutation'
                ? { animation: 'water-wave 3s ease-in-out infinite' }
                : {}}
            />

            {/* 放出系: 色が変わるオーバーレイ */}
            {nenType === 'emission' && (
              <rect
                x='28'
                y='35'
                width='84'
                height='85'
                fill={info.color}
                opacity='0.4'
                style={{ animation: 'color-shift 2s ease-in-out infinite' }}
              />
            )}

            {/* 具現化系: 不純物 */}
            {nenType === 'conjuration' && (
              <>
                <circle
                  cx='50'
                  cy='70'
                  r='4'
                  fill={info.color}
                  style={{ animation: 'particle-float 2s ease-in-out infinite' }}
                />
                <circle
                  cx='75'
                  cy='85'
                  r='3'
                  fill={info.color}
                  opacity='0.8'
                  style={{ animation: 'particle-float 2.5s ease-in-out infinite 0.3s' }}
                />
                <circle
                  cx='90'
                  cy='65'
                  r='3.5'
                  fill={info.color}
                  opacity='0.9'
                  style={{ animation: 'particle-float 1.8s ease-in-out infinite 0.6s' }}
                />
                <circle
                  cx='60'
                  cy='95'
                  r='2.5'
                  fill={info.color}
                  opacity='0.7'
                  style={{ animation: 'particle-float 2.2s ease-in-out infinite 0.9s' }}
                />
              </>
            )}

            {/* 特質系: 不思議なエフェクト */}
            {nenType === 'specialization' && (
              <g style={{ animation: 'special-pulse 3s ease-in-out infinite' }}>
                <circle cx='70' cy='70' r='20' fill={info.color} opacity='0.3' />
                <circle cx='70' cy='70' r='12' fill={info.color} opacity='0.5' />
              </g>
            )}
          </g>

          {/* 葉っぱ */}
          <g
            style={nenType === 'manipulation'
              ? { animation: 'leaf-move 2s ease-in-out infinite' }
              : {}}
          >
            <ellipse
              cx='70'
              cy='38'
              rx='12'
              ry='6'
              fill='#228B22'
              opacity='0.9'
            />
            <path
              d='M70 32 Q72 38 70 44'
              stroke='#1a6b1a'
              strokeWidth='1'
              fill='none'
            />
          </g>

          {/* 強化系: 溢れる水滴 */}
          {nenType === 'enhancement' && (
            <>
              <circle
                cx='35'
                cy='25'
                r='3'
                fill='rgba(100, 180, 255, 0.8)'
                style={{ animation: 'water-drip 1.5s ease-in infinite' }}
              />
              <circle
                cx='105'
                cy='25'
                r='3'
                fill='rgba(100, 180, 255, 0.8)'
                style={{ animation: 'water-drip 1.5s ease-in infinite 0.5s' }}
              />
              <circle
                cx='70'
                cy='20'
                r='2.5'
                fill='rgba(100, 180, 255, 0.8)'
                style={{ animation: 'water-drip 1.5s ease-in infinite 1s' }}
              />
            </>
          )}

          {/* コップの光沢 */}
          <path
            d='M35 25 L33 100'
            stroke='rgba(255,255,255,0.3)'
            strokeWidth='3'
            strokeLinecap='round'
          />
        </svg>

        {/* オーラのグロー効果 */}
        <div
          className='absolute inset-0 rounded-full blur-xl opacity-30'
          style={{
            backgroundColor: info.color,
            animation: nenType === 'specialization'
              ? 'special-glow 2s ease-in-out infinite'
              : 'glow 2s ease-in-out infinite alternate',
          }}
        />
      </div>

      <p className='mt-4 text-slate-400 text-sm italic text-center'>
        {info.waterDivinationResult}
      </p>
    </div>
  );
};

const ScoreBar = ({
  nenType,
  percentage,
}: {
  nenType: NenType;
  percentage: number;
}) => {
  const info = NenType.getInfo(nenType);

  return (
    <div className='flex items-center gap-3 mb-3'>
      <div className='w-20 text-right'>
        <span className='text-sm text-slate-400'>{info.japaneseName}</span>
      </div>
      <div className='flex-1 bg-slate-700 rounded-full h-4 overflow-hidden'>
        <div
          className='h-full rounded-full transition-all duration-1000 ease-out'
          style={{
            width: `${percentage}%`,
            backgroundColor: info.color,
          }}
        />
      </div>
      <div className='w-12 text-right'>
        <span className='text-sm text-slate-300'>{percentage}%</span>
      </div>
    </div>
  );
};

/**
 * 二項対立軸のプロファイルバー
 * スコア範囲: -2 〜 +2
 */
const AxisProfileBar = ({
  axis,
  score,
  primaryType,
}: {
  axis: JudgmentAxis;
  score: number;
  primaryType: NenType;
}) => {
  const info = AXIS_INFO[axis];
  const contribution = AXIS_CONTRIBUTIONS[axis];
  const primaryInfo = NenType.getInfo(primaryType);

  // スコアを0-100のパーセンテージに変換（-2→0, 0→50, +2→100）
  const percentage = ((score + 2) / 4) * 100;

  // この軸がprimaryTypeに寄与しているかどうか
  const isContributing = (score > 0 && contribution.positive.some((c) => c.nenType === primaryType))
    || (score < 0 && contribution.negative.some((c) => c.nenType === primaryType));

  return (
    <div className='mb-4'>
      <div className='flex justify-between items-center mb-1'>
        <span className='text-xs text-slate-500'>{info.negativeLabel}</span>
        <span
          className='text-sm font-medium'
          style={{ color: isContributing ? primaryInfo.color : '#94a3b8' }}
        >
          {info.japaneseName}
        </span>
        <span className='text-xs text-slate-500'>{info.positiveLabel}</span>
      </div>
      <div className='relative h-3 bg-slate-700 rounded-full overflow-hidden'>
        {/* 中央のマーカー */}
        <div className='absolute left-1/2 top-0 w-0.5 h-full bg-slate-500 z-10' />
        {/* スコアインジケーター */}
        <div
          className='absolute top-0 h-full w-3 rounded-full transition-all duration-500 ease-out'
          style={{
            left: `calc(${percentage}% - 6px)`,
            backgroundColor: isContributing ? primaryInfo.color : '#64748b',
          }}
        />
        {/* スコアが偏っている方向を示すバー */}
        {score !== 0 && (
          <div
            className='absolute top-0 h-full transition-all duration-500 ease-out opacity-30'
            style={{
              left: score > 0 ? '50%' : `${percentage}%`,
              width: `${Math.abs(score) * 25}%`,
              backgroundColor: isContributing ? primaryInfo.color : '#64748b',
            }}
          />
        )}
      </div>
      <div className='flex justify-center mt-1'>
        <span className='text-xs text-slate-400'>
          {score > 0 ? `+${score}` : score}
        </span>
      </div>
    </div>
  );
};

const JudgmentBasisSection = ({
  result,
}: {
  result: DiagnosisResult;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const primaryInfo = NenType.getInfo(result.primaryType);
  const contribution = AXIS_CONTRIBUTIONS;

  // primaryTypeに寄与している軸とその回答を抽出
  const contributingAxes = JUDGMENT_AXES.filter((axis) => {
    const score = result.axisScores[axis];
    const axisContrib = contribution[axis];
    return (
      (score > 0 && axisContrib.positive.some((c) => c.nenType === result.primaryType))
      || (score < 0 && axisContrib.negative.some((c) => c.nenType === result.primaryType))
    );
  });

  // 軸ごとにグループ化した判定根拠
  const groupedBasis = contributingAxes.map((axis) => {
    const axisInfo = AXIS_INFO[axis];
    const score = result.axisScores[axis];
    const answers = result.judgmentBasis.filter((b) => b.axis === axis);
    return { axis, axisInfo, score, answers };
  });

  return (
    <div className='bg-slate-900/50 rounded-xl p-6 mb-8'>
      <h4 className='text-lg font-semibold text-white mb-4'>判定根拠</h4>

      <div className='mb-4'>
        <p className='text-slate-300 text-sm leading-relaxed'>
          あなたの回答傾向から
          <span
            className='font-bold mx-1'
            style={{ color: primaryInfo.color }}
          >
            {primaryInfo.japaneseName}
          </span>
          と判定されました。
        </p>
      </div>

      {groupedBasis.length > 0 && (
        <div className='space-y-4'>
          {groupedBasis.slice(0, isExpanded ? undefined : 2).map(({ axis, axisInfo, score, answers }) => (
            <div
              key={axis}
              className='p-4 bg-slate-800/50 rounded-lg border-l-2'
              style={{ borderColor: primaryInfo.color }}
            >
              <div className='flex items-center gap-2 mb-2'>
                <span
                  className='px-2 py-0.5 rounded text-xs font-medium'
                  style={{
                    backgroundColor: `${primaryInfo.color}20`,
                    color: primaryInfo.color,
                  }}
                >
                  {axisInfo.japaneseName} {score > 0 ? `+${score}` : score}
                </span>
                <span className='text-slate-400 text-xs'>
                  {score > 0 ? axisInfo.positiveLabel : axisInfo.negativeLabel}
                </span>
              </div>
              <ul className='space-y-1'>
                {answers.map((basis) => (
                  <li key={basis.questionId} className='text-slate-400 text-xs leading-relaxed'>
                    「{basis.answerText}」
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {groupedBasis.length > 2 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className='text-purple-400 text-sm hover:text-purple-300 transition-colors'
            >
              {isExpanded
                ? '折りたたむ'
                : `他${groupedBasis.length - 2}件の根拠を表示`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const ResultCard = ({ result, onRestart }: ResultCardProps) => {
  const primaryInfo = NenType.getInfo(result.primaryType);
  const secondaryInfo = result.secondaryType
    ? NenType.getInfo(result.secondaryType)
    : null;

  return (
    <div className='animate-fade-in'>
      <div className='bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 shadow-xl'>
        <h2 className='text-2xl font-bold text-center text-white mb-8'>
          診断結果
        </h2>

        <WaterDivinationAnimation nenType={result.primaryType} />

        <div className='text-center mb-8'>
          <div className='mb-2'>
            <span className='text-slate-400'>あなたの念系統は...</span>
          </div>
          <h3
            className='text-4xl font-bold mb-2 nen-glow inline-block px-4 py-2 rounded-lg'
            style={{ color: primaryInfo.color }}
          >
            {primaryInfo.japaneseName}
          </h3>
          {secondaryInfo && (
            <p className='text-slate-400 mt-2'>
              サブ系統:{' '}
              <span style={{ color: secondaryInfo.color }}>
                {secondaryInfo.japaneseName}
              </span>
            </p>
          )}
        </div>

        <div className='bg-slate-900/50 rounded-xl p-6 mb-8'>
          <h4 className='text-lg font-semibold text-white mb-4'>性格特性</h4>
          <p className='text-slate-300 leading-relaxed'>
            {primaryInfo.personality}
          </p>
        </div>

        <div className='bg-slate-900/50 rounded-xl p-6 mb-8'>
          <h4 className='text-lg font-semibold text-white mb-4'>
            あなたの傾向プロファイル
          </h4>
          <p className='text-slate-500 text-xs mb-4'>
            5つの判断軸における傾向（中央が中立、左右に振れるほど傾向が強い）
          </p>
          <div className='mt-4'>
            {JUDGMENT_AXES.map((axis) => (
              <AxisProfileBar
                key={axis}
                axis={axis}
                score={result.axisScores[axis]}
                primaryType={result.primaryType}
              />
            ))}
          </div>
        </div>

        <JudgmentBasisSection result={result} />

        <div className='bg-slate-900/50 rounded-xl p-6 mb-8'>
          <h4 className='text-lg font-semibold text-white mb-4'>
            系統別スコア
          </h4>
          <div className='mt-4'>
            {NEN_TYPES.map((type) => (
              <ScoreBar
                key={type}
                nenType={type}
                percentage={result.percentages[type]}
              />
            ))}
          </div>
        </div>

        <div className='bg-slate-900/50 rounded-xl p-6 mb-8'>
          <h4 className='text-lg font-semibold text-white mb-4'>能力の特徴</h4>
          <p className='text-slate-300 leading-relaxed'>
            {primaryInfo.description}
          </p>
        </div>

        <div className='bg-slate-900/50 rounded-xl p-6 mb-8'>
          <h4 className='text-lg font-semibold text-white mb-4'>相性</h4>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <p className='text-sm text-slate-400 mb-2'>相性の良い系統</p>
              <div className='flex flex-wrap gap-2'>
                {primaryInfo.compatibleTypes.map((type) => {
                  const info = NenType.getInfo(type);
                  return (
                    <span
                      key={type}
                      className='px-3 py-1 rounded-full text-sm'
                      style={{
                        backgroundColor: `${info.color}30`,
                        color: info.color,
                      }}
                    >
                      {info.japaneseName}
                    </span>
                  );
                })}
              </div>
            </div>
            <div>
              <p className='text-sm text-slate-400 mb-2'>相性の悪い系統</p>
              <div className='flex flex-wrap gap-2'>
                {primaryInfo.incompatibleTypes.map((type) => {
                  const info = NenType.getInfo(type);
                  return (
                    <span
                      key={type}
                      className='px-3 py-1 rounded-full text-sm bg-slate-700 text-slate-400'
                    >
                      {info.japaneseName}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <ShareButton result={result} />

        <button
          onClick={onRestart}
          className='w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600
            hover:from-purple-500 hover:to-pink-500
            text-white font-semibold transition-all duration-200
            shadow-lg hover:shadow-purple-500/25'
        >
          もう一度診断する
        </button>
      </div>
    </div>
  );
};
