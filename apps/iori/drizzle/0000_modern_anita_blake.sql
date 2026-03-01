CREATE TABLE "actors" (
	"actorId" uuid PRIMARY KEY NOT NULL,
	"uri" text NOT NULL,
	"inboxUrl" text NOT NULL,
	"type" varchar(32) NOT NULL,
	CONSTRAINT "actors_uri_unique" UNIQUE("uri"),
	CONSTRAINT "actors_inboxUrl_unique" UNIQUE("inboxUrl")
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"eventId" uuid PRIMARY KEY NOT NULL,
	"aggregateId" json NOT NULL,
	"aggregateName" varchar(128) NOT NULL,
	"aggregateState" json,
	"eventName" varchar(128) NOT NULL,
	"eventPayload" json,
	"occurredAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"followerId" uuid NOT NULL,
	"followingId" uuid NOT NULL,
	CONSTRAINT "follower_following_unique" UNIQUE("followerId","followingId")
);
--> statement-breakpoint
CREATE TABLE "keys" (
	"keyId" uuid PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"privateKey" text NOT NULL,
	"publicKey" text NOT NULL,
	CONSTRAINT "user_key_type_unique" UNIQUE("userId","type")
);
--> statement-breakpoint
CREATE TABLE "local_actors" (
	"actorId" uuid PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	CONSTRAINT "local_actor_user_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "local_posts" (
	"postId" uuid PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"postId" uuid PRIMARY KEY NOT NULL,
	"actorId" uuid NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"type" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_actors" (
	"actorId" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_posts" (
	"postId" uuid PRIMARY KEY NOT NULL,
	"uri" text NOT NULL,
	CONSTRAINT "remote_posts_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionId" uuid PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_passwords" (
	"userId" uuid PRIMARY KEY NOT NULL,
	"algorithm" varchar(32) NOT NULL,
	"parallelism" integer NOT NULL,
	"tagLength" integer NOT NULL,
	"memory" integer NOT NULL,
	"passes" integer NOT NULL,
	"nonceHex" text NOT NULL,
	"tagHex" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"userId" uuid PRIMARY KEY NOT NULL,
	"username" varchar(255) NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_actors_actorId_fk" FOREIGN KEY ("followerId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followingId_actors_actorId_fk" FOREIGN KEY ("followingId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keys" ADD CONSTRAINT "keys_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_actors" ADD CONSTRAINT "local_actors_actorId_actors_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_actors" ADD CONSTRAINT "local_actors_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_posts" ADD CONSTRAINT "local_posts_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_posts" ADD CONSTRAINT "local_posts_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_actorId_actors_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_actors" ADD CONSTRAINT "remote_actors_actorId_actors_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_posts" ADD CONSTRAINT "remote_posts_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_passwords" ADD CONSTRAINT "user_passwords_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;