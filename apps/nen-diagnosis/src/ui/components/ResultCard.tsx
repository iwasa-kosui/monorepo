import { useCallback, useState } from 'react';

import type { DiagnosisResult } from '../../domain/diagnosis/diagnosis.ts';
import {
  AXIS_CONTRIBUTIONS,
  AXIS_INFO,
  JUDGMENT_AXES,
  type JudgmentAxis,
} from '../../domain/judgmentAxis/judgmentAxis.ts';
import { NEN_TYPES, NenType } from '../../domain/nenType/nenType.ts';

const createShareUrl = (result: DiagnosisResult): string => {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('type', result.primaryType);
  if (result.secondaryType) {
    url.searchParams.set('sub', result.secondaryType);
  }
  return url.toString();
};

const ShareButton = ({ result }: { result: DiagnosisResult }) => {
  const [copied, setCopied] = useState(false);
  const primaryInfo = NenType.getInfo(result.primaryType);
  const shareUrl = createShareUrl(result);

  const shareText = `念系統診断の結果は「${primaryInfo.japaneseName}」でした！\n${
    primaryInfo.personality.slice(0, 50)
  }...\n\n${shareUrl}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードAPIが使えない場合
    }
  }, [shareText]);

  const handleTwitterShare = useCallback(() => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  }, [shareText]);

  const handleMastodonShare = useCallback(() => {
    const mastodonUrl = `https://mastodonshare.com/?text=${encodeURIComponent(shareText)}`;
    window.open(mastodonUrl, '_blank', 'noopener,noreferrer');
  }, [shareText]);

  const handleMisskeyShare = useCallback(() => {
    const misskeyUrl = `https://misskey-hub.net/share/?text=${encodeURIComponent(shareText)}`;
    window.open(misskeyUrl, '_blank', 'noopener,noreferrer');
  }, [shareText]);

  return (
    <div className='space-y-3 mb-4'>
      {/* コピーボタン */}
      <button
        onClick={handleCopy}
        className='w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600
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
                  d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
                />
              </svg>
              結果をコピー
            </>
          )}
      </button>

      {/* SNSシェアボタン */}
      <div className='flex gap-3'>
        <button
          onClick={handleTwitterShare}
          className='flex-1 py-3 px-4 rounded-xl bg-[#000000] hover:bg-[#333333]
            text-white font-medium transition-all duration-200
            flex items-center justify-center gap-2'
          aria-label='Xでシェア'
        >
          <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
            <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
          </svg>
          <span className='hidden sm:inline'>X</span>
        </button>
        <button
          onClick={handleMastodonShare}
          className='flex-1 py-3 px-4 rounded-xl bg-[#6364FF] hover:bg-[#5253dd]
            text-white font-medium transition-all duration-200
            flex items-center justify-center gap-2'
          aria-label='Mastodonでシェア'
        >
          <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
            <path d='M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z' />
          </svg>
          <span className='hidden sm:inline'>Mastodon</span>
        </button>
        <button
          onClick={handleMisskeyShare}
          className='flex-1 py-3 px-4 rounded-xl bg-[#96d04a] hover:bg-[#7cb53d]
            text-white font-medium transition-all duration-200
            flex items-center justify-center gap-2'
          aria-label='Misskeyでシェア'
        >
          <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
            <path d='M11.518.96a2.39 2.39 0 0 1 .964 0c.238.053.413.142.564.234.292.178.527.408.79.671l9.12 9.545c.248.264.45.493.596.756.12.215.202.425.238.654a2.39 2.39 0 0 1 0 .964c-.054.238-.143.413-.234.564-.178.292-.408.527-.672.79l-9.544 9.12c-.264.248-.493.45-.756.596a1.981 1.981 0 0 1-.654.238 2.39 2.39 0 0 1-.964 0 1.981 1.981 0 0 1-.564-.234c-.292-.178-.527-.408-.79-.671l-9.12-9.545c-.248-.264-.45-.493-.596-.756a1.981 1.981 0 0 1-.238-.654 2.39 2.39 0 0 1 0-.964c.054-.238.143-.413.234-.564.178-.292.408-.527.672-.79l9.544-9.12c.264-.248.493-.45.756-.596.215-.12.425-.202.654-.238Z' />
          </svg>
          <span className='hidden sm:inline'>Misskey</span>
        </button>
      </div>
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
