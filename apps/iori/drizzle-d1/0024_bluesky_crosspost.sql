CREATE TABLE `bluesky_crossposts` (
	`postId` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`skipReason` text,
	`uri` text,
	`cid` text,
	`rkey` text,
	`rootUri` text,
	`rootCid` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bluesky_crossposts_status_created_at_idx` ON `bluesky_crossposts` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `bluesky_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`did` text NOT NULL,
	`handle` text NOT NULL,
	`pdsUrl` text NOT NULL,
	`accessJwt` text NOT NULL,
	`refreshJwt` text NOT NULL,
	`updatedAt` integer NOT NULL
);
