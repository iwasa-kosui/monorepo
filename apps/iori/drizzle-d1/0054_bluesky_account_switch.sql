CREATE TABLE `bluesky_account_switch` (
	`id` text PRIMARY KEY NOT NULL,
	`switchId` text NOT NULL,
	`fromDid` text NOT NULL,
	`toDid` text NOT NULL,
	`startedAt` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`deletedCounts` text NOT NULL,
	`updatedAt` integer NOT NULL
);
