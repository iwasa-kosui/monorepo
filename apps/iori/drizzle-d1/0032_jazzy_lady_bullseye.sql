CREATE TABLE `bluesky_notification_receipts` (
	`uri` text PRIMARY KEY NOT NULL,
	`indexedAt` integer NOT NULL,
	`receivedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bluesky_notification_receipts_indexed_at_idx` ON `bluesky_notification_receipts` (`indexedAt`);--> statement-breakpoint
CREATE TABLE `notification_bluesky` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`blueskyUri` text NOT NULL,
	`reason` text NOT NULL,
	`authorDid` text NOT NULL,
	`authorHandle` text NOT NULL,
	`authorDisplayName` text,
	`authorAvatar` text,
	`subjectUri` text,
	`targetPostId` text,
	`text` text,
	FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`notificationId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_bluesky_blueskyUri_unique` ON `notification_bluesky` (`blueskyUri`);