import { useCallback, useEffect, useState } from 'react';

import { type AxisScore, Diagnosis, type DiagnosisResult } from './domain/diagnosis/diagnosis.ts';
import { NEN_TYPES, type NenType } from './domain/nenType/nenType.ts';
import type { Answer } from './domain/question/question.ts';
import { Question } from './domain/question/question.ts';
import { ProgressBar } from './ui/components/ProgressBar.tsx';
import { QuestionCard } from './ui/components/QuestionCard.tsx';
import { ResultCard } from './ui/components/ResultCard.tsx';
import { StartScreen } from './ui/components/StartScreen.tsx';

type GameState = 'start' | 'playing' | 'result';

const isValidNenType = (value: string): value is NenType =>
  NEN_TYPES.includes(value as NenType);

const parseResultFromUrl = (): { primaryType: NenType; secondaryType: NenType | null } | null => {
  const params = new URLSearchParams(window.location.search);
  const primary = params.get('type');
  const secondary = params.get('sub');

  if (!primary || !isValidNenType(primary)) {
    return null;
  }

  return {
    primaryType: primary,
    secondaryType: secondary && isValidNenType(secondary) ? secondary : null,
  };
};

const createResultFromUrlParams = (
  primaryType: NenType,
  secondaryType: NenType | null,
): DiagnosisResult => {
  // URLパラメータから復元する場合は、簡易的なスコアを生成
  const baseScore = 100;
  const percentages = NEN_TYPES.reduce(
    (acc, type) => {
      if (type === primaryType) {
        acc[type] = baseScore;
      } else if (type === secondaryType) {
        acc[type] = Math.round(baseScore * 0.8);
      } else {
        acc[type] = Math.round(baseScore * 0.4);
      }
      return acc;
    },
    {} as Record<NenType, number>,
  );

  // パーセンテージを正規化（合計100%に）
  const total = Object.values(percentages).reduce((sum, v) => sum + v, 0);
  const normalizedPercentages = Object.fromEntries(
    Object.entries(percentages).map(([k, v]) => [k, Math.round((v / total) * 100)]),
  ) as Record<NenType, number>;

  return {
    axisScores: Diagnosis.createEmptyAxisScore(),
    nenTypeScores: NEN_TYPES.reduce(
      (acc, type) => {
        acc[type] = normalizedPercentages[type];
        return acc;
      },
      {} as Record<NenType, number>,
    ),
    primaryType,
    secondaryType,
    percentages: normalizedPercentages,
    judgmentBasis: [],
  };
};

export const App = () => {
  const [gameState, setGameState] = useState<GameState>('start');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [axisScore, setAxisScore] = useState<AxisScore>(Diagnosis.createEmptyAxisScore());
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const questions = Question.all();

  // URLパラメータから結果を復元
  useEffect(() => {
    const urlResult = parseResultFromUrl();
    if (urlResult) {
      const restoredResult = createResultFromUrlParams(urlResult.primaryType, urlResult.secondaryType);
      setResult(restoredResult);
      setGameState('result');
    }
  }, []);
  const currentQuestion = questions[currentQuestionIndex];

  const handleStart = useCallback(() => {
    setGameState('playing');
    setCurrentQuestionIndex(0);
    setAxisScore(Diagnosis.createEmptyAxisScore());
    setAnswers([]);
    setResult(null);
  }, []);

  const handleAnswer = useCallback(
    (answer: Answer) => {
      const newAxisScore = Diagnosis.addAnswerToAxisScore(axisScore, answer);
      const newAnswers = [...answers, answer];

      setAxisScore(newAxisScore);
      setAnswers(newAnswers);

      if (currentQuestionIndex < questions.length - 1) {
        setIsAnimating(true);
        setTimeout(() => {
          setCurrentQuestionIndex((prev) => prev + 1);
          setIsAnimating(false);
        }, 300);
      } else {
        const diagnosisResult = Diagnosis.calculate(
          newAxisScore,
          newAnswers,
          questions,
        );
        setResult(diagnosisResult);
        setGameState('result');
      }
    },
    [axisScore, answers, currentQuestionIndex, questions],
  );

  const handleRestart = useCallback(() => {
    setGameState('start');
    setCurrentQuestionIndex(0);
    setAxisScore(Diagnosis.createEmptyAxisScore());
    setAnswers([]);
    setResult(null);
  }, []);

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900'>
      <div className='container mx-auto px-4 py-8 max-w-2xl'>
        <header className='text-center mb-8'>
          <h1 className='text-2xl font-bold text-white'>念系統診断</h1>
          <p className='text-slate-500 text-sm mt-1'>
            ヒソカのオーラ別性格分析
          </p>
        </header>

        <main>
          {gameState === 'start' && <StartScreen onStart={handleStart} />}

          {gameState === 'playing' && currentQuestion && (
            <>
              <ProgressBar
                current={currentQuestionIndex + 1}
                total={questions.length}
              />
              <QuestionCard
                question={currentQuestion}
                onAnswer={handleAnswer}
                isAnimating={isAnimating}
              />
            </>
          )}

          {gameState === 'result' && result && <ResultCard result={result} onRestart={handleRestart} />}
        </main>

        <footer className='text-center mt-8 text-slate-500 text-sm'>
          <p>This is a fan-made diagnosis app.</p>
        </footer>
      </div>
    </div>
  );
};
