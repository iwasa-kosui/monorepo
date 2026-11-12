CREATE INDEX `emoji_reacts_post_id_idx` ON `emoji_reacts` (`postId`);--> statement-breakpoint
CREATE INDEX `likes_post_id_idx` ON `likes` (`postId`);--> statement-breakpoint
CREATE INDEX `post_images_post_id_idx` ON `post_images` (`postId`);--> statement-breakpoint
CREATE INDEX `reposts_post_id_idx` ON `reposts` (`postId`);--> statement-breakpoint
CREATE INDEX `timeline_items_post_id_idx` ON `timeline_items` (`postId`);