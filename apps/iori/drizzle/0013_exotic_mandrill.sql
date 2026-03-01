CREATE TABLE "mutes" (
	"muteId" uuid PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"mutedActorId" uuid NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "mute_user_actor_unique" UNIQUE("userId","mutedActorId")
);
--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_userId_users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_mutedActorId_actors_actorId_fk" FOREIGN KEY ("mutedActorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mutes_user_id_idx" ON "mutes" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mutes_muted_actor_id_idx" ON "mutes" USING btree ("mutedActorId");