CREATE TABLE "notification_follows" (
	"notificationId" uuid PRIMARY KEY NOT NULL,
	"followerActorId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"subscriptionId" uuid PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dhKey" text NOT NULL,
	"authKey" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reposts" (
	"repostId" uuid PRIMARY KEY NOT NULL,
	"actorId" uuid NOT NULL,
	"objectUri" text NOT NULL,
	"originalPostId" uuid,
	"announceActivityUri" text,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "reposts_announceActivityUri_unique" UNIQUE("announceActivityUri"),
	CONSTRAINT "repost_actor_object_unique" UNIQUE("actorId","objectUri")
);
--> statement-breakpoint
CREATE TABLE "timeline_items" (
	"timelineItemId" uuid PRIMARY KEY NOT NULL,
	"type" varchar(16) NOT NULL,
	"actorId" uuid NOT NULL,
	"postId" uuid NOT NULL,
	"repostId" uuid,
	"createdAt" timestamp NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "notification_follows" ADD CONSTRAINT "notification_follows_notificationId_notifications_notificationId_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notifications"("notificationId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_follows" ADD CONSTRAINT "notification_follows_followerActorId_actors_actorId_fk" FOREIGN KEY ("followerActorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_actorId_actors_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_originalPostId_posts_postId_fk" FOREIGN KEY ("originalPostId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_actorId_actors_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_items" ADD CONSTRAINT "timeline_items_repostId_reposts_repostId_fk" FOREIGN KEY ("repostId") REFERENCES "public"."reposts"("repostId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Migrate existing posts to timeline_items
INSERT INTO "timeline_items" ("timelineItemId", "type", "actorId", "postId", "repostId", "createdAt", "deletedAt")
SELECT
  gen_random_uuid(),
  'post',
  "actorId",
  "postId",
  NULL,
  "createdAt",
  "deletedAt"
FROM "posts";