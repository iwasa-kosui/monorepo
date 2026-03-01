CREATE TABLE "emoji_reacts" (
	"emojiReactId" uuid PRIMARY KEY NOT NULL,
	"actorId" uuid NOT NULL,
	"objectUri" text NOT NULL,
	"emoji" varchar(128) NOT NULL,
	"emojiReactActivityUri" text,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "emoji_reacts_emojiReactActivityUri_unique" UNIQUE("emojiReactActivityUri"),
	CONSTRAINT "emoji_react_actor_object_emoji_unique" UNIQUE("actorId","objectUri","emoji")
);
--> statement-breakpoint
CREATE TABLE "notification_emoji_reacts" (
	"notificationId" uuid PRIMARY KEY NOT NULL,
	"reactorActorId" uuid NOT NULL,
	"reactedPostId" uuid NOT NULL,
	"emoji" varchar(128) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emoji_reacts" ADD CONSTRAINT "emoji_reacts_actorId_actors_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_emoji_reacts" ADD CONSTRAINT "notification_emoji_reacts_notificationId_notifications_notificationId_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notifications"("notificationId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_emoji_reacts" ADD CONSTRAINT "notification_emoji_reacts_reactorActorId_actors_actorId_fk" FOREIGN KEY ("reactorActorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;