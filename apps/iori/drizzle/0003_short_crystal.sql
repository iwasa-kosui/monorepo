CREATE TABLE "likes" (
	"likeId" uuid PRIMARY KEY NOT NULL,
	"actorId" uuid NOT NULL,
	"objectUri" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "actor_object_unique" UNIQUE("actorId","objectUri")
);
--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_actorId_actors_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;