ALTER TABLE `bluesky_timeline_items` ADD `bridgyOriginalUrl` text;--> statement-breakpoint
ALTER TABLE `remote_posts` ADD `url` text;--> statement-breakpoint
CREATE INDEX `remote_posts_url_idx` ON `remote_posts` (`url`);