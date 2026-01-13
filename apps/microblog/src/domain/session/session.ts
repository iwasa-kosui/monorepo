import z from "zod/v4";
import { UserId } from "../user/userId.ts";
import { Instant } from "../instant/instant.ts";
import { SessionId } from "./sessionId.ts";
import type { Agg } from "../aggregate/index.ts";
import { AggregateEvent, type DomainEvent } from "../aggregate/event.ts";
import { Schema } from "../../helper/schema.ts";

const zodType = z.object({
  sessionId: SessionId.zodType,
  userId: UserId.zodType,
  expires: Instant.zodType,
}).describe('Session');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);

export type Session = z.output<typeof zodType>;
export type SessionAggregate = Agg.Aggregate<SessionId, 'session', Session>;
export type SessionEvent<TAggregateState extends Agg.InferState<SessionAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>
> = DomainEvent<SessionAggregate, TAggregateState, TEventName, TEventPayload>;

export const SessionEvent = AggregateEvent.createFactory<SessionAggregate>('session');
export type SessionStarted = SessionEvent<Session, 'session.started', Omit<Session, 'sessionId'>>;
export type SessionStartedStore = Agg.Store<SessionStarted>;
export type SessionResolver = Agg.Resolver<SessionId, Session | undefined>;

const startSession = (now: Instant) => (payload: Omit<Session, 'sessionId'>): SessionStarted =>
  SessionEvent.create(
    SessionId.generate(),
    { ...payload, sessionId: SessionId.generate() },
    'session.started',
    payload,
    now,
  );

export const Session = {
  ...schema,
  startSession,
  verify: (session: Session, now: Instant): boolean => {
    return session.expires > now;
  },
} as const;

export type SessionExpiredError = Readonly<{
  type: 'SessionExpiredError';
  message: string;
  detail: {
    sessionId: SessionId;
  }
}>;

export const SessionExpiredError = {
  create: (sessionId: SessionId): SessionExpiredError => ({
    type: 'SessionExpiredError',
    message: `The session with ID "${sessionId}" has expired.`,
    detail: { sessionId },
  }),
} as const;
