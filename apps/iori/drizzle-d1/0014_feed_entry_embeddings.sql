ALTER TABLE `feed_entries` ADD `embedding` blob;--> statement-breakpoint
ALTER TABLE `feed_entries` ADD `embeddedAt` integer;--> statement-breakpoint
CREATE INDEX `feed_entries_embedded_at_fetched_at_idx` ON `feed_entries` (`embeddedAt`,`fetchedAt`);