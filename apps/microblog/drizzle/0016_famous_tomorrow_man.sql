CREATE TABLE "link_previews" (
	"linkPreviewId" uuid PRIMARY KEY NOT NULL,
	"postId" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"imageUrl" text,
	"faviconUrl" text,
	"siteName" text,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "link_previews" ADD CONSTRAINT "link_previews_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_previews_post_id_idx" ON "link_previews" USING btree ("postId");