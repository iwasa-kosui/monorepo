import data from './data.json' with { type: 'json' };

export type TalkMeta = {
  title: string;
  date: string;
  event: string;
  tags: string[];
  duration: string;
  description: string;
  year: string;
  name: string;
  slideType: string;
};

export const getTalks = (): TalkMeta[] => data as TalkMeta[];
