import { describe, expect, it } from 'vitest';

import { JUDGMENT_AXES } from '../judgmentAxis/judgmentAxis.ts';
import { Question, QUESTIONS } from './question.ts';

describe('Question', () => {
  describe('QUESTIONS', () => {
    it('14問が定義されている', () => {
      expect(QUESTIONS).toHaveLength(14);
    });

    it('各軸に対して2問ずつ存在する', () => {
      for (const axis of JUDGMENT_AXES) {
        const questionsForAxis = QUESTIONS.filter((q) => q.axis === axis);
        expect(questionsForAxis).toHaveLength(2);
      }
    });

    it('質問IDが1から14まで連番で設定されている', () => {
      const ids = QUESTIONS.map((q) => q.id);
      for (let i = 1; i <= 14; i++) {
        expect(ids).toContain(i);
      }
    });

    it('質問IDに重複がない', () => {
      const ids = QUESTIONS.map((q) => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('各質問に2つの選択肢がある', () => {
      for (const question of QUESTIONS) {
        expect(question.answers).toHaveLength(2);
      }
    });

    it('各質問の選択肢にpositiveとnegativeがある', () => {
      for (const question of QUESTIONS) {
        const directions = question.answers.map((a) => a.direction);
        expect(directions).toContain('positive');
        expect(directions).toContain('negative');
      }
    });

    it('選択肢のaxisが質問のaxisと一致する', () => {
      for (const question of QUESTIONS) {
        for (const answer of question.answers) {
          expect(answer.axis).toBe(question.axis);
        }
      }
    });

    it('選択肢IDが重複しない', () => {
      const allAnswerIds = QUESTIONS.flatMap((q) => q.answers.map((a) => a.id));
      const uniqueAnswerIds = new Set(allAnswerIds);
      expect(uniqueAnswerIds.size).toBe(allAnswerIds.length);
    });

    it('各質問にtextが設定されている', () => {
      for (const question of QUESTIONS) {
        expect(typeof question.text).toBe('string');
        expect(question.text.length).toBeGreaterThan(0);
      }
    });

    it('各選択肢にtextが設定されている', () => {
      for (const question of QUESTIONS) {
        for (const answer of question.answers) {
          expect(typeof answer.text).toBe('string');
          expect(answer.text.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Question.all', () => {
    it('全ての質問を返す', () => {
      const questions = Question.all();
      expect(questions).toEqual(QUESTIONS);
    });
  });

  describe('Question.getById', () => {
    it('IDで質問を取得できる', () => {
      const question = Question.getById(1);
      expect(question).toBeDefined();
      expect(question?.id).toBe(1);
    });

    it('全てのIDで質問を取得できる', () => {
      for (let i = 1; i <= 14; i++) {
        const question = Question.getById(i);
        expect(question).toBeDefined();
        expect(question?.id).toBe(i);
      }
    });

    it('存在しないIDはundefinedを返す', () => {
      const question = Question.getById(999);
      expect(question).toBeUndefined();
    });

    it('0以下のIDはundefinedを返す', () => {
      expect(Question.getById(0)).toBeUndefined();
      expect(Question.getById(-1)).toBeUndefined();
    });
  });

  describe('Question.count', () => {
    it('質問数14を返す', () => {
      expect(Question.count()).toBe(14);
    });

    it('QUESTIONSの長さと一致する', () => {
      expect(Question.count()).toBe(QUESTIONS.length);
    });
  });

  describe('質問内容の検証', () => {
    it('commitment軸の質問が目標達成や挫折に関するものである', () => {
      const commitmentQuestions = QUESTIONS.filter((q) => q.axis === 'commitment');
      expect(commitmentQuestions.some((q) => q.text.includes('目標達成'))).toBe(true);
      expect(commitmentQuestions.some((q) => q.text.includes('挫折'))).toBe(true);
    });

    it('logic軸の質問が学習や決断に関するものである', () => {
      const logicQuestions = QUESTIONS.filter((q) => q.axis === 'logic');
      expect(logicQuestions.some((q) => q.text.includes('学ぶ'))).toBe(true);
      expect(logicQuestions.some((q) => q.text.includes('決断'))).toBe(true);
    });

    it('independence軸の質問がチームや意見に関するものである', () => {
      const independenceQuestions = QUESTIONS.filter((q) => q.axis === 'independence');
      expect(independenceQuestions.some((q) => q.text.includes('意見'))).toBe(true);
      expect(independenceQuestions.some((q) => q.text.includes('チーム'))).toBe(true);
    });

    it('caution軸の質問が書類確認や計画に関するものである', () => {
      const cautionQuestions = QUESTIONS.filter((q) => q.axis === 'caution');
      expect(cautionQuestions.some((q) => q.text.includes('書類') || q.text.includes('メール'))).toBe(
        true,
      );
      expect(cautionQuestions.some((q) => q.text.includes('計画'))).toBe(true);
    });

    it('honesty軸の質問が遅刻や嘘に関するものである', () => {
      const honestyQuestions = QUESTIONS.filter((q) => q.axis === 'honesty');
      expect(honestyQuestions.some((q) => q.text.includes('遅れ'))).toBe(true);
      expect(honestyQuestions.some((q) => q.text.includes('嘘'))).toBe(true);
    });

    it('empathy軸の質問が他者への感情に関するものである', () => {
      const empathyQuestions = QUESTIONS.filter((q) => q.axis === 'empathy');
      expect(empathyQuestions.some((q) => q.text.includes('困っている'))).toBe(true);
      expect(empathyQuestions.some((q) => q.text.includes('友人') && q.text.includes('落ち込'))).toBe(
        true,
      );
    });

    it('charisma軸の質問がグループでの立場や初対面に関するものである', () => {
      const charismaQuestions = QUESTIONS.filter((q) => q.axis === 'charisma');
      expect(charismaQuestions.some((q) => q.text.includes('グループ'))).toBe(true);
      expect(charismaQuestions.some((q) => q.text.includes('初対面'))).toBe(true);
    });
  });
});
