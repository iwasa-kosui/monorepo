CREATE TABLE "notification_replies" (
	"notificationId" uuid PRIMARY KEY NOT NULL,
	"replierActorId" uuid NOT NULL,
	"replyPostId" uuid NOT NULL,
	"originalPostId" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_replies" ADD CONSTRAINT "notification_replies_notificationId_notifications_notificationId_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notifications"("notificationId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_replies" ADD CONSTRAINT "notification_replies_replierActorId_actors_actorId_fk" FOREIGN KEY ("replierActorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;
