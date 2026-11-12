import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

const zodType = z.enum(['both', 'fediverse', 'bluesky']);
export type PostDestination = z.infer<typeof zodType>;
const schema = Schema.create(zodType);

// Bluesky だけの投稿は同時投稿ではなく直接投稿の経路で送るので、ここでは false にする
const sendsToBluesky = (destination: PostDestination): boolean => destination === 'both';

export const PostDestination = {
  ...schema,
  sendsToBluesky,
} as const;
