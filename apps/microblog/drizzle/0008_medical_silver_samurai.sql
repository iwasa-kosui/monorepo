ALTER TABLE "notification_likes" DROP CONSTRAINT "notification_likes_likedPostId_posts_postId_fk";
--> statement-breakpoint
ALTER TABLE "reposts" DROP CONSTRAINT "reposts_originalPostId_posts_postId_fk";
--> statement-breakpoint
ALTER TABLE "timeline_items" DROP CONSTRAINT "timeline_items_postId_posts_postId_fk";
--> statement-breakpoint
ALTER TABLE "timeline_items" DROP CONSTRAINT "timeline_items_repostId_reposts_repostId_fk";
