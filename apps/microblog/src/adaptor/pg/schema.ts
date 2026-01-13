import { integer, json, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  userId: uuid().primaryKey(),
  username: varchar({ length: 255 }).notNull().unique(),
});

export const keysTable = pgTable("keys", {
  keyId: uuid().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => usersTable.userId),
  type: varchar({ length: 32 })
    .notNull(),
  privateKey: text()
    .notNull(),
  publicKey: text()
    .notNull(),
}, (table) => [
  unique('user_key_type_unique').on(table.userId, table.type),
]);

export const domainEventsTable = pgTable("domain_events", {
  eventId: uuid().primaryKey(),
  aggregateId: json().notNull(),
  aggregateName: varchar({ length: 128 }).notNull(),
  aggregateState: json(),
  eventName: varchar({ length: 128 }).notNull(),
  eventPayload: json(),
  occurredAt: timestamp({ mode: 'date' }).notNull(),
});

export const actorsTable = pgTable("actors", {
  actorId: uuid().primaryKey(),
  uri: text().notNull().unique(),
  logoUri: text(),
  inboxUrl: text().notNull().unique(),
  type: varchar({ length: 32 }).notNull(),
});

export const localActorsTable = pgTable("local_actors", {
  actorId: uuid().primaryKey().references(() => actorsTable.actorId),
  userId: uuid().notNull().references(() => usersTable.userId),
}, (t) => [
  unique('local_actor_user_unique').on(t.userId),
]);

export const remoteActorsTable = pgTable("remote_actors", {
  actorId: uuid().primaryKey().references(() => actorsTable.actorId),
  url: text(),
  username: text(),
});

export const followsTable = pgTable("follows", {
  followerId: uuid()
    .notNull()
    .references(() => actorsTable.actorId),
  followingId: uuid()
    .notNull()
    .references(() => actorsTable.actorId),
}, (table) => [
  unique('follower_following_unique').on(table.followerId, table.followingId),
]);

export const userPasswordsTable = pgTable("user_passwords", {
  userId: uuid().primaryKey().references(() => usersTable.userId),
  algorithm: varchar({ length: 32 }).notNull(),
  parallelism: integer().notNull(),
  tagLength: integer().notNull(),
  memory: integer().notNull(),
  passes: integer().notNull(),
  nonceHex: text().notNull(),
  tagHex: text().notNull(),
});

export const sessionsTable = pgTable("sessions", {
  sessionId: uuid().primaryKey(),
  userId: uuid().notNull().references(() => usersTable.userId),
  expires: timestamp({ mode: 'date' }).notNull(),
});

export const postsTable = pgTable("posts", {
  postId: uuid().primaryKey(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  content: text().notNull(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
  type: varchar({ length: 32 }).notNull(),
});

export const remotePostsTable = pgTable("remote_posts", {
  postId: uuid().primaryKey().references(() => postsTable.postId),
  uri: text().notNull().unique(),
});

export const localPostsTable = pgTable("local_posts", {
  postId: uuid().primaryKey().references(() => postsTable.postId),
  userId: uuid().notNull().references(() => usersTable.userId),
});
