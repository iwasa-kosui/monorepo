CREATE TABLE `digest_request_usages` (
	`userId` text NOT NULL,
	`day` text NOT NULL,
	`count` integer NOT NULL,
	`lastRequestedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `day`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `digests` ADD `trigger` text DEFAULT 'scheduled' NOT NULL;