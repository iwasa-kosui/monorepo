CREATE TABLE `feed_entries` (
	`feedEntryId` text PRIMARY KEY NOT NULL,
	`feedSourceId` text NOT NULL,
	`guid` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`publishedAt` integer,
	`hatenaBookmarkCount` integer,
	`fetchedAt` integer NOT NULL,
	FOREIGN KEY (`feedSourceId`) REFERENCES `feed_sources`(`feedSourceId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feed_entries_feed_source_guid_unique` ON `feed_entries` (`feedSourceId`,`guid`);--> statement-breakpoint
CREATE INDEX `feed_entries_url_idx` ON `feed_entries` (`url`);--> statement-breakpoint
CREATE INDEX `feed_entries_published_at_idx` ON `feed_entries` (`publishedAt`);--> statement-breakpoint
CREATE INDEX `feed_entries_fetched_at_idx` ON `feed_entries` (`fetchedAt`);--> statement-breakpoint
CREATE TABLE `feed_sources` (
	`feedSourceId` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`enabled` integer NOT NULL,
	`etag` text,
	`lastModified` text,
	`lastFetchedAt` integer,
	`lastError` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feed_sources_url_unique` ON `feed_sources` (`url`);