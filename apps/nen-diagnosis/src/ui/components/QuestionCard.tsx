import type { Answer, Question } from '../../domain/question/question.ts';
import { TRAIT_AXIS_INFO } from '../../domain/question/question.ts';

type QuestionCardProps = Readonly<{
  question: Question;
  onAnswer: (answer: Answer) => void;
  isAnimating: boolean;
}>;

export const QuestionCard = ({
  question,
  onAnswer,
  isAnimating,
}: QuestionCardProps) => {
  const traitInfo = TRAIT_AXIS_INFO[question.traitAxis];

  return (
    <div
      className={`transition-all duration-300 ${isAnimating ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'}`}
    >
      <div className='bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 shadow-xl'>
        <div className='mb-4'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-medium'>
              {traitInfo.japaneseName}を測定
            </span>
          </div>
          <p className='text-slate-500 text-sm'>{traitInfo.description}</p>
        </div>

        <h2 className='text-xl md:text-2xl font-bold text-white mb-8 leading-relaxed'>
          {question.text}
        </h2>

        <div className='space-y-3'>
          {question.answers.map((answer) => (
            <button
              key={answer.id}
              onClick={() => onAnswer(answer)}
              className='w-full text-left p-4 rounded-xl bg-slate-700/50 hover:bg-slate-600/50
                border border-slate-600 hover:border-purple-500
                transition-all duration-200 group'
            >
              <span className='text-slate-200 group-hover:text-white transition-colors text-sm md:text-base'>
                {answer.text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
