import type { ActorId } from '../actor/actorId.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { User } from './user.ts';
import { UserEvent } from './userAggregate.ts';

type Payload = Readonly<{ userId: User['id']; username: User['username']; actorId: ActorId }>;

/**
 * ローカルのアカウントを退役させた。ユーザーとローカルアクター、そのアクターの投稿・反応・フォロー・通知などを消す。
 * 消す前に、アクターの Delete をフォロワーへ配送しておく（配送はユースケースが行う）。
 */
export type LocalAccountRetired = UserEvent<undefined, 'user.localAccountRetired', Payload>;

export const retireLocalAccount = (now: Instant) => (payload: Payload): LocalAccountRetired =>
  UserEvent.create(payload.userId, undefined, 'user.localAccountRetired', payload, now);

/** アカウントにつながるデータを、子から親の順に 1 つのトランザクションで消す */
export type LocalAccountRetiredStore = Agg.Store<LocalAccountRetired>;
