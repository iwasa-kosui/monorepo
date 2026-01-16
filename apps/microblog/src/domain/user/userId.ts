import { z } from "zod/v4";

import { Schema } from "../../helper/schema.ts";

export const UserIdSym = Symbol('UserId');
const zodType = z.uuid().brand(UserIdSym).describe('UserId');
export type UserId = z.output<typeof zodType>;

const schema = Schema.create<UserId, string>(zodType);

/**
 * UserId はユーザーを一意に識別するための文字列であり、過去や将来にわたって変更されないことが求められます。
 * また、既に存在するユーザーと衝突しないように設計されなければなりません。
 */
export const UserId = {
  ...schema,
  generate: (): UserId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
