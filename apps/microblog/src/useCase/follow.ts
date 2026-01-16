import { RA } from "@iwasa-kosui/result";

import type { Actor } from "../domain/actor/actor.ts";
import type { SessionId } from "../domain/session/sessionId.ts";
import type { UseCase } from "./useCase.ts";


type Input = Readonly<{
  sessionId: SessionId;
  following: Actor
}>;

type Ok = void;

type Err = unknown;

export type FollowUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
}>

const create = ({ }: Deps): FollowUseCase => {
  const run = async (input: Input) =>
    Promise.resolve(RA.ok(undefined));

  return { run };
};

export const FollowUseCase = {
  create,
} as const;
