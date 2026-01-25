CREATE TABLE "federated_timeline_items" (
	"federatedTimelineItemId" uuid PRIMARY KEY NOT NULL,
	"postId" uuid NOT NULL,
	"relayId" uuid NOT NULL,
	"receivedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relays" (
	"relayId" uuid PRIMARY KEY NOT NULL,
	"inboxUrl" text NOT NULL,
	"actorUri" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"createdAt" timestamp NOT NULL,
	"acceptedAt" timestamp,
	CONSTRAINT "relays_inboxUrl_unique" UNIQUE("inboxUrl"),
	CONSTRAINT "relays_actorUri_unique" UNIQUE("actorUri")
);
--> statement-breakpoint
ALTER TABLE "federated_timeline_items" ADD CONSTRAINT "federated_timeline_items_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federated_timeline_items" ADD CONSTRAINT "federated_timeline_items_relayId_relays_relayId_fk" FOREIGN KEY ("relayId") REFERENCES "public"."relays"("relayId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "federated_timeline_items_received_at_idx" ON "federated_timeline_items" USING btree ("receivedAt");--> statement-breakpoint
CREATE INDEX "federated_timeline_items_post_id_idx" ON "federated_timeline_items" USING btree ("postId");