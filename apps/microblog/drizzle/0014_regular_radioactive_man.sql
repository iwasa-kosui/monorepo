ALTER TABLE "emoji_reacts" DROP CONSTRAINT "emoji_react_actor_object_emoji_unique";--> statement-breakpoint
ALTER TABLE "likes" DROP CONSTRAINT "actor_object_unique";--> statement-breakpoint
ALTER TABLE "likes_v2" DROP CONSTRAINT "likes_v2_actor_object_unique";--> statement-breakpoint
ALTER TABLE "reposts" DROP CONSTRAINT "repost_actor_object_unique";--> statement-breakpoint
ALTER TABLE "emoji_reacts" ADD COLUMN "postId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "likes" ADD COLUMN "postId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "likes_v2" ADD COLUMN "postId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reposts" ADD COLUMN "postId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "emoji_reacts" ADD CONSTRAINT "emoji_reacts_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes_v2" ADD CONSTRAINT "likes_v2_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_postId_posts_postId_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("postId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emoji_reacts" DROP COLUMN "objectUri";--> statement-breakpoint
ALTER TABLE "likes" DROP COLUMN "objectUri";--> statement-breakpoint
ALTER TABLE "likes_v2" DROP COLUMN "objectUri";--> statement-breakpoint
ALTER TABLE "reposts" DROP COLUMN "objectUri";--> statement-breakpoint
ALTER TABLE "reposts" DROP COLUMN "originalPostId";--> statement-breakpoint
ALTER TABLE "emoji_reacts" ADD CONSTRAINT "emoji_react_actor_post_emoji_unique" UNIQUE("actorId","postId","emoji");--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "like_actor_post_unique" UNIQUE("actorId","postId");--> statement-breakpoint
ALTER TABLE "likes_v2" ADD CONSTRAINT "likes_v2_actor_post_unique" UNIQUE("actorId","postId");--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "repost_actor_post_unique" UNIQUE("actorId","postId");