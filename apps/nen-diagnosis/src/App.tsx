import { useCallback, useState } from 'react';

import { Diagnosis, type DiagnosisResult, type Score } from './domain/diagnosis/diagnosis.ts';
import type { Answer } from './domain/question/question.ts';
import { Question } from './domain/question/question.ts';
import { ProgressBar } from './ui/components/ProgressBar.tsx';
import { QuestionCard } from './ui/components/QuestionCard.tsx';
import { ResultCard } from './ui/components/ResultCard.tsx';
import { StartScreen } from './ui/components/StartScreen.tsx';

type GameState = 'start' | 'playing' | 'result';

export const App = () => {
  const [gameState, setGameState] = useState<GameState>('start');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState<Score>(Diagnosis.createEmptyScore());
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const questions = Question.all();
  const currentQuestion = questions[currentQuestionIndex];

  const handleStart = useCallback(() => {
    setGameState('playing');
    setCurrentQuestionIndex(0);
    setScore(Diagnosis.createEmptyScore());
    setAnswers([]);
    setResult(null);
  }, []);

  const handleAnswer = useCallback(
    (answer: Answer) => {
      const newScore = Diagnosis.addAnswer(score, answer);
      const newAnswers = [...answers, answer];

      setScore(newScore);
      setAnswers(newAnswers);

      if (currentQuestionIndex < questions.length - 1) {
        setIsAnimating(true);
        setTimeout(() => {
          setCurrentQuestionIndex((prev) => prev + 1);
          setIsAnimating(false);
        }, 300);
      } else {
        const diagnosisResult = Diagnosis.calculate(
          newScore,
          newAnswers,
          questions,
        );
        setResult(diagnosisResult);
        setGameState('result');
      }
    },
    [score, answers, currentQuestionIndex, questions],
  );

  const handleRestart = useCallback(() => {
    setGameState('start');
    setCurrentQuestionIndex(0);
    setScore(Diagnosis.createEmptyScore());
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
