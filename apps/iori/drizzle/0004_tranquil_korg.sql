CREATE TABLE "post_images" (
	"imageId" uuid PRIMARY KEY NOT NULL,
	"postId" uuid NOT NULL,
	"url" text NOT NULL,
	"altText" text,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;