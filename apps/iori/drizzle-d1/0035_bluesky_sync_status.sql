CREATE TABLE `bluesky_sync_status` (
	`scope` text PRIMARY KEY NOT NULL,
	`lastSucceededAt` integer,
	`lastFailedAt` integer,
	`lastFailureKind` text,
	`lastFailureCode` text
);
