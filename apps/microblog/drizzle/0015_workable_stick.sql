CREATE TABLE "articles" (
	"articleId" uuid PRIMARY KEY NOT NULL,
	"authorActorId" uuid NOT NULL,
	"authorUserId" uuid NOT NULL,
	"rootPostId" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" varchar(16) NOT NULL,
	"createdAt" timestamp NOT NULL,
	"publishedAt" timestamp,
	"unpublishedAt" timestamp,
	CONSTRAINT "article_root_post_unique" UNIQUE("rootPostId")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorActorId_actors_actorId_fk" FOREIGN KEY ("authorActorId") REFERENCES "public"."actors"("actorId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorUserId_users_userId_fk" FOREIGN KEY ("authorUserId") REFERENCES "public"."users"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_rootPostId_posts_postId_fk" FOREIGN KEY ("rootPostId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_author_actor_id_idx" ON "articles" USING btree ("authorActorId");--> statement-breakpoint
CREATE INDEX "articles_root_post_id_idx" ON "articles" USING btree ("rootPostId");