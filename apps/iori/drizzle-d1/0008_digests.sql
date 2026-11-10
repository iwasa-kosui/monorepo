CREATE TABLE `digest_items` (
	`digestItemId` text PRIMARY KEY NOT NULL,
	`digestId` text NOT NULL,
	`feedEntryId` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`rank` integer NOT NULL,
	`score` real,
	`summary` text,
	`reasonInterestSourceId` text,
	`feedback` text,
	FOREIGN KEY (`digestId`) REFERENCES `digests`(`digestId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_items_digest_id_rank_unique` ON `digest_items` (`digestId`,`rank`);--> statement-breakpoint
CREATE TABLE `digest_subscriptions` (
	`userId` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `digest_trends` (
	`digestId` text NOT NULL,
	`kind` text NOT NULL,
	`rank` integer NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`digestId`, `kind`, `rank`),
	FOREIGN KEY (`digestId`) REFERENCES `digests`(`digestId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `digests` (
	`digestId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`digestDate` text NOT NULL,
	`articleId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`pushSentAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`articleId`) REFERENCES `articles`(`articleId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digests_user_id_digest_date_unique` ON `digests` (`userId`,`digestDate`);--> statement-breakpoint
CREATE INDEX `digests_digest_date_idx` ON `digests` (`digestDate`);