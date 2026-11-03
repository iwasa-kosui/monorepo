import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { PostId } from '../../domain/post/postId.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { SendEmojiReactUseCase } from '../../useCase/sendEmojiReact.ts';
import type { UndoEmojiReactUseCase } from '../../useCase/undoEmojiReact.ts';

export type WorkerSocialActionsApiRouterDeps = Readonly<{
  sendEmojiReactUseCase: SendEmojiReactUseCase;
  undoEmojiReactUseCase: UndoEmojiReactUseCase;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

const postSchema = z.object({ postId: PostId.zodType });
const reactionSchema = postSchema.extend({ emoji: z.string().min(1).max(128) });

export const createWorkerSocialActionsApiRouter = (
  deps: WorkerSocialActionsApiRouterDeps,
): Hono =>
  new Hono()
    .post('/v1/react', sValidator('json', reactionSchema), async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: 'Invalid session' }, 401);
      const { postId, emoji } = c.req.valid('json');
      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to react: ${JSON.stringify(err)}` }, 400),
      })(
        await deps.sendEmojiReactUseCase.run({
          sessionId: sessionId.val,
          postId,
          emoji,
          request: c.req.raw,
          ctx: deps.createContext(c.req.raw),
        }),
      );
    })
    .delete('/v1/react', sValidator('json', reactionSchema), async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: 'Invalid session' }, 401);
      const { postId, emoji } = c.req.valid('json');
      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to undo react: ${JSON.stringify(err)}` }, 400),
      })(
        await deps.undoEmojiReactUseCase.run({
          sessionId: sessionId.val,
          postId,
          emoji,
          request: c.req.raw,
          ctx: deps.createContext(c.req.raw),
        }),
      );
    });
