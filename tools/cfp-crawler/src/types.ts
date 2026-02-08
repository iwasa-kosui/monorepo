import { z } from 'zod';

const CfpSourceSchema = z.enum(['fortee', 'findy']);
export type CfpSource = z.infer<typeof CfpSourceSchema>;

const CfpEntrySchema = z.object({
  conferenceName: z.string().describe('カンファレンス名'),
  cfpUrl: z.string().url().nullable().describe('CFP応募URL'),
  conferenceUrl: z.string().url().describe('カンファレンス公式URL'),
  cfpDeadline: z.date().nullable().describe('CFP締切日'),
  conferenceDate: z.date().nullable().describe('カンファレンス開催日'),
  location: z.string().nullable().describe('開催場所'),
  source: CfpSourceSchema.describe('情報源'),
}).readonly();

export type CfpEntry = z.infer<typeof CfpEntrySchema>;

export const CfpEntry = {
  schema: CfpEntrySchema,
} as const;
