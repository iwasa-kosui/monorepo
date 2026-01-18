import type { Answer, Question } from '../../domain/question/question.ts';

type QuestionCardProps = Readonly<{
  question: Question;
  onAnswer: (answer: Answer) => void;
  isAnimating: boolean;
}>;

export const QuestionCard = ({ question, onAnswer, isAnimating }: QuestionCardProps) => {
  return (
    <div
      className={`transition-all duration-300 ${
        isAnimating ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'
      }`}
    >
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 shadow-xl">
        <div className="mb-2">
          <span className="text-purple-400 text-sm font-medium">
            {question.title}
          </span>
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-8 leading-relaxed">
          {question.text}
        </h2>

        <div className="space-y-4">
          {question.answers.map((answer) => (
            <button
              key={answer.id}
              onClick={() => onAnswer(answer)}
              className="w-full text-left p-4 rounded-xl bg-slate-700/50 hover:bg-slate-600/50
                border border-slate-600 hover:border-purple-500
                transition-all duration-200 group"
            >
              <span className="text-slate-200 group-hover:text-white transition-colors">
                {answer.text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
