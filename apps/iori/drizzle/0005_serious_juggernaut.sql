CREATE TABLE "likes_v2" (
	"likeId" uuid PRIMARY KEY NOT NULL,
	"actorId" uuid NOT NULL,
	"objectUri" text NOT NULL,
	"likeActivityUri" text,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "likes_v2_likeActivityUri_unique" UNIQUE("likeActivityUri"),
	CONSTRAINT "likes_v2_actor_object_unique" UNIQUE("actorId","objectUri")
);
--> statement-breakpoint
CREATE TABLE "notification_likes" (
	"notificationId" uuid PRIMARY KEY NOT NULL,
	"likerActorId" uuid NOT NULL,
	"likedPostId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"notificationId" uuid PRIMARY KEY NOT NULL,
	"recipientUserId" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"isRead" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "likes_v2" ADD CONSTRAINT "likes_v2_actorId_actors_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_likes" ADD CONSTRAINT "notification_likes_notificationId_notifications_notificationId_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notifications"("notificationId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_likes" ADD CONSTRAINT "notification_likes_likerActorId_actors_actorId_fk" FOREIGN KEY ("likerActorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_likes" ADD CONSTRAINT "notification_likes_likedPostId_posts_postId_fk" FOREIGN KEY ("likedPostId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_users_userId_fk" FOREIGN KEY ("recipientUserId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "likes_v2" ("likeId", "actorId", "objectUri", "likeActivityUri", "createdAt")
SELECT "likeId", "actorId", "objectUri", NULL, "createdAt"
FROM "likes";