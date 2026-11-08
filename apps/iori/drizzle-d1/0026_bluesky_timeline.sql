CREATE TABLE `bluesky_timeline_items` (
	`feedItemId` text PRIMARY KEY NOT NULL,
	`uri` text NOT NULL,
	`cid` text NOT NULL,
	`authorDid` text NOT NULL,
	`authorHandle` text NOT NULL,
	`authorDisplayName` text,
	`authorAvatar` text,
	`text` text NOT NULL,
	`facets` text NOT NULL,
	`embed` text,
	`replyParentUri` text,
	`replyParentAuthorHandle` text,
	`repostedByDid` text,
	`repostedByHandle` text,
	`postedAt` integer NOT NULL,
	`indexedAt` integer NOT NULL,
	`fetchedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bluesky_timeline_items_indexed_at_idx` ON `bluesky_timeline_items` (`indexedAt`);
